#include "HarmonyRuntimeHost.hpp"
#include "HarmonyHostLifecycle.hpp"
#include "HarmonyOTAProcess.hpp"
#include "valdi_core/cpp/Utils/ValueArray.hpp"
#include "valdi_core/cpp/Utils/ValueTypedObject.hpp"

#include <arkui/native_node_napi.h>

#include <array>
#include <cmath>
#include <exception>
#include <map>
#include <set>
#include <stdexcept>
#include <string>
#include <thread>
#include <utility>

namespace ValdiHarmony {
namespace {

constexpr double kMaxHandle = 9007199254740991.0;
constexpr size_t kMaxHosts = 16;

struct Environment {
    napi_env env = nullptr;
    uv_loop_t* loop = nullptr;
    Valdi::Ref<HarmonyMainThreadDispatcher> dispatcher;
    napi_async_cleanup_hook_handle cleanup = nullptr;
    std::map<uint64_t, std::unique_ptr<HarmonyRuntimeHost>> hosts;
    std::map<uint64_t, napi_ref> navigationObservers;
    std::set<ArkUI_NodeContentHandle> contents;
    uint64_t nextHandle = 1;
    size_t jobs = 0;
    bool closing = false;
    bool otaEnvironmentRetained = false;
};

struct DestroyJob {
    uv_work_t work{};
    Environment* environment;
    std::unique_ptr<HarmonyRuntimeHost> host;
    napi_deferred deferred = nullptr;
    std::string error;
};

void check(napi_status status, const char* operation) {
    if (status != napi_ok) {
        throw std::runtime_error(operation);
    }
}

void throwError(napi_env env, const char* message) {
    logNativeError(message);
    bool pending = false;
    napi_is_exception_pending(env, &pending);
    if (!pending) {
        napi_throw_error(env, "ERR_VALDI_HARMONY", message);
    }
}

napi_value undefined(napi_env env) {
    napi_value result;
    check(napi_get_undefined(env, &result), "Cannot create undefined");
    return result;
}

struct Arguments {
    std::array<napi_value, 10> values{};
    size_t count = 0;
    Environment* environment;

    Arguments(napi_env env, napi_callback_info info, size_t expected, size_t minimum = 0) {
        void* data = nullptr;
        // Query the true arity first: a full argv buffer can otherwise hide
        // surplus mount arguments when the ABI grows.
        check(napi_get_cb_info(env, info, &count, nullptr, nullptr, &data), "Cannot count call arguments");
        if (count > values.size() ||
            (count != expected && !(minimum > 0 && count >= minimum && count < expected))) {
            throw std::invalid_argument("Incorrect number of arguments");
        }
        check(napi_get_cb_info(env, info, &count, values.data(), nullptr, nullptr), "Cannot read call arguments");
        environment = static_cast<Environment*>(data);
        if (environment == nullptr || environment->closing || !environment->dispatcher->isUIThread()) {
            throw std::runtime_error("Valdi Harmony APIs require the owning, live ArkTS UI environment");
        }
    }
};

double number(napi_env env, napi_value value, const char* name, double maximum, bool allowZero) {
    napi_valuetype type;
    check(napi_typeof(env, value, &type), "Cannot inspect numeric argument");
    double result = 0;
    if (type != napi_number || napi_get_value_double(env, value, &result) != napi_ok ||
        !std::isfinite(result) || (allowZero ? result < 0 : result <= 0) || result > maximum) {
        throw std::invalid_argument(std::string(name) + " must be a finite " +
                                    (allowZero ? "nonnegative" : "positive") + " number in range");
    }
    return result;
}

uint64_t handle(napi_env env, napi_value value) {
    const auto result = number(env, value, "handle", kMaxHandle, false);
    if (std::floor(result) != result) {
        throw std::invalid_argument("handle must be a positive safe integer");
    }
    return static_cast<uint64_t>(result);
}

HarmonyRuntimeHost& findHost(Environment& environment, uint64_t id) {
    const auto found = environment.hosts.find(id);
    if (found == environment.hosts.end()) {
        throw std::invalid_argument("Unknown or destroyed Valdi Harmony handle in this environment");
    }
    return *found->second;
}

HostConfiguration readConfiguration(napi_env env, napi_value resources, double width, double height, double scale) {
    napi_valuetype type;
    check(napi_typeof(env, resources, &type), "Cannot inspect ResourceManager");
    if (type != napi_object) {
        throw std::invalid_argument("resourceManager must be an ArkTS ResourceManager");
    }
    napi_value method;
    check(napi_get_named_property(env, resources, "getConfigurationSync", &method),
          "ResourceManager.getConfigurationSync is required");
    check(napi_typeof(env, method, &type), "Cannot inspect getConfigurationSync");
    if (type != napi_function) {
        throw std::invalid_argument("ResourceManager.getConfigurationSync is required");
    }
    napi_value configuration;
    check(napi_call_function(env, resources, method, 0, nullptr, &configuration),
          "ResourceManager.getConfigurationSync failed");
    napi_value color;
    check(napi_get_named_property(env, configuration, "colorMode", &color), "Configuration.colorMode is required");
    int32_t mode = -1;
    check(napi_get_value_int32(env, color, &mode), "Configuration.colorMode must be a number");
    if (mode != 0 && mode != 1) {
        throw std::runtime_error("ResourceManager must resolve a light or dark colorMode");
    }
    napi_value locale;
    check(napi_get_named_property(env, configuration, "locale", &locale), "Configuration.locale is required");
    size_t length = 0;
    check(napi_get_value_string_utf8(env, locale, nullptr, 0, &length), "Configuration.locale must be a string");
    if (length > 256) {
        throw std::invalid_argument("Configuration.locale is too long");
    }
    std::string localeString(length + 1, '\0');
    size_t copied = 0;
    check(napi_get_value_string_utf8(env, locale, localeString.data(), localeString.size(), &copied),
          "Cannot read Configuration.locale");
    localeString.resize(copied);
    return HostConfiguration{width, height, scale, mode == 0, std::move(localeString), {}};
}

void maybeFinishCleanup(Environment* environment) {
    if (!environment->closing || !environment->hosts.empty() || environment->jobs != 0) {
        return;
    }
    environment->dispatcher->close([environment] {
        if (environment->otaEnvironmentRetained) {
            environment->otaEnvironmentRetained = false;
            // Every host/worker has drained. Process-native OTA is independent
            // of JS/system ports; cancel/join it before its own HTTP shutdown.
            HarmonyOTAProcess::releaseEnvironment();
        }
        const auto status = napi_remove_async_cleanup_hook(environment->cleanup);
        if (status != napi_ok) {
            logNativeError("napi_remove_async_cleanup_hook failed");
        }
        delete environment;
    });
}

void executeDestroy(DestroyJob* job) {
    TeardownErrors errors;
    if (!job->error.empty()) errors.append(job->error);
    errors.run([&] { job->host->fullTeardown(); });
    job->error = errors.message();
}

void completeDestroy(DestroyJob* rawJob, int status) {
    std::unique_ptr<DestroyJob> job(rawJob);
    auto* environment = job->environment;
    if (status != 0 && job->error.empty()) {
        job->error = uv_strerror(status);
    }
    TeardownErrors errors;
    if (!job->error.empty()) errors.append(job->error);
    errors.run([&] { job->host->releaseOnUI(); });
    job->error = errors.message();
    for (auto content : job->host->contents()) environment->contents.erase(content);
    job->host.reset();
    if (!job->error.empty()) {
        logNativeError(job->error.c_str());
    }
    if (!environment->closing && job->deferred != nullptr) {
        napi_handle_scope scope = nullptr;
        if (napi_open_handle_scope(environment->env, &scope) == napi_ok) {
            if (job->error.empty()) {
                napi_value result = nullptr;
                if (napi_get_undefined(environment->env, &result) == napi_ok) {
                    napi_resolve_deferred(environment->env, job->deferred, result);
                }
            } else {
                napi_value message = nullptr;
                napi_value error = nullptr;
                if (napi_create_string_utf8(environment->env, job->error.c_str(), NAPI_AUTO_LENGTH, &message) == napi_ok &&
                    napi_create_error(environment->env, nullptr, message, &error) == napi_ok) {
                    napi_reject_deferred(environment->env, job->deferred, error);
                }
            }
            napi_close_handle_scope(environment->env, scope);
        }
    }
    environment->jobs--;
    if (environment->jobs == 0) {
        environment->dispatcher->keepAlive(false);
    }
    maybeFinishCleanup(environment);
}

void startDestroy(Environment* environment, uint64_t id, napi_deferred deferred = nullptr) {
    auto job = std::make_unique<DestroyJob>();
    job->environment = environment;
    job->deferred = deferred;
    job->work.data = job.get();
    job->host = takeHostForDestruction(environment->hosts, id);
    // Count the owner before unmount drains shared UI work. A nested destroy
    // cannot find this handle or finish environment cleanup underneath us.
    environment->jobs++;
    environment->dispatcher->keepAlive(true);
    const auto observer = environment->navigationObservers.find(id);
    if (observer != environment->navigationObservers.end()) {
        napi_delete_reference(environment->env, observer->second);
        environment->navigationObservers.erase(observer);
    }
    TeardownErrors errors;
    errors.run([&] { job->host->unmount(environment->closing); });
    job->error = errors.message();
    // Even failed UI cleanup must reach worker teardown. Start the worker only
    // after the outermost unmount for this claimed host has returned.
    const auto status = uv_queue_work(
        environment->loop, &job->work,
        [](uv_work_t* work) { executeDestroy(static_cast<DestroyJob*>(work->data)); },
        [](uv_work_t* work, int result) { completeDestroy(static_cast<DestroyJob*>(work->data), result); });
    if (status != 0) {
        // A loop/pool enqueue failure must never force fullTeardown onto the UI
        // thread. A dedicated worker uses the same live UI dispatcher to finish.
        try {
            std::thread([raw = job.get(), dispatcher = environment->dispatcher] {
                executeDestroy(raw);
                dispatcher->dispatch(new Valdi::DispatchFunction([raw] { completeDestroy(raw, 0); }), false);
            }).detach();
        } catch (...) {
            // Keep ownership available to an explicit retry or environment
            // cleanup if neither worker mechanism can start.
            environment->hosts.emplace(id, std::move(job->host));
            environment->jobs--;
            if (environment->jobs == 0) {
                environment->dispatcher->keepAlive(false);
            }
            throw;
        }
    }
    job.release();
}

napi_value mount(napi_env env, napi_callback_info info) {
    Environment* environment = nullptr;
    uint64_t id = 0;
    try {
        Arguments args(env, info, 10, 7);
        environment = args.environment;
        if (environment->hosts.size() + environment->jobs >= kMaxHosts ||
            static_cast<double>(environment->nextHandle) > kMaxHandle) {
            throw std::runtime_error("Valdi Harmony host capacity reached");
        }
        ArkUI_NodeContentHandle content = nullptr;
        if (OH_ArkUI_GetNodeContentFromNapiValue(env, args.values[0], &content) != 0 || content == nullptr) {
            throw std::invalid_argument("content must be a valid ArkUI NodeContent");
        }
        if (environment->contents.find(content) != environment->contents.end()) {
            throw std::invalid_argument("NodeContent is already mounted or being destroyed");
        }
        ArkUI_ContextHandle uiContext = nullptr;
        if (OH_ArkUI_GetContextFromNapiValue(env, args.values[5], &uiContext) != 0 || uiContext == nullptr) {
            throw std::invalid_argument("uiContext must be the owning ArkUI UIContext");
        }
        const auto width = number(env, args.values[2], "width", 1000000, true);
        const auto height = number(env, args.values[3], "height", 1000000, true);
        const auto scale = number(env, args.values[4], "scale", 64, false);
        auto configuration = readConfiguration(env, args.values[1], width, height, scale);
        napi_valuetype pathType;
        check(napi_typeof(env, args.values[6], &pathType), "Cannot inspect filesDir");
        size_t pathLength = 0;
        if (pathType != napi_string ||
            napi_get_value_string_utf8(env, args.values[6], nullptr, 0, &pathLength) != napi_ok ||
            pathLength == 0 || pathLength > 4096) {
            throw std::invalid_argument("filesDir must be the owning ability's absolute files directory");
        }
        std::string filesDir(pathLength + 1, '\0');
        check(napi_get_value_string_utf8(env, args.values[6], filesDir.data(), filesDir.size(), &pathLength),
              "Cannot read filesDir");
        filesDir.resize(pathLength);
        if (filesDir.front() != '/' || filesDir.find('\0') != std::string::npos) {
            throw std::invalid_argument("filesDir must be an absolute path without null bytes");
        }
        configuration.storageRoot = std::move(filesDir) + "/valdi";
        napi_value appUIFeedback = nullptr;
        if (args.count >= 8) {
            napi_valuetype type;
            check(napi_typeof(env, args.values[7], &type), "Cannot inspect AppUI feedback host");
            if (type == napi_object) appUIFeedback = args.values[7];
            else if (type != napi_undefined) {
                throw std::invalid_argument("AppUI feedback host must be an object");
            }
        }
        napi_value systemServices = nullptr;
        if (args.count >= 9) {
            napi_valuetype type;
            check(napi_typeof(env, args.values[8], &type), "Cannot inspect system services");
            if (type == napi_object) {
                napi_value nullValue;
                bool isNull = false;
                check(napi_get_null(env, &nullValue), "Cannot inspect null system services");
                check(napi_strict_equals(env, args.values[8], nullValue, &isNull), "Cannot inspect system services");
                if (isNull) throw std::invalid_argument("System services must be an owning UIAbility service object");
                systemServices = args.values[8];
            } else if (type != napi_undefined) {
                throw std::invalid_argument("System services must be an owning UIAbility service object");
            }
        }
        bool active = true;
        if (args.count == 10) {
            napi_valuetype type;
            check(napi_typeof(env, args.values[9], &type), "Cannot inspect initial activity");
            if (type == napi_boolean) {
                check(napi_get_value_bool(env, args.values[9], &active), "Cannot read initial activity");
            } else if (type != napi_undefined) {
                throw std::invalid_argument("Initial activity must be a boolean");
            }
        }
        auto host = std::make_unique<HarmonyRuntimeHost>(
            env, args.values[0], args.values[1], args.values[5], content, uiContext,
            environment->dispatcher, std::move(configuration), appUIFeedback, systemServices, active);
        id = environment->nextHandle++;
        environment->hosts.emplace(id, std::move(host));
        environment->contents.emplace(content);
        findHost(*environment, id).mount();
        napi_value result;
        check(napi_create_double(env, static_cast<double>(id), &result), "Cannot create host handle");
        return result;
    } catch (const std::exception& error) {
        if (environment != nullptr && id != 0 && environment->hosts.find(id) != environment->hosts.end()) {
            try {
                startDestroy(environment, id);
            } catch (const std::exception& cleanupError) {
                logNativeError(cleanupError.what());
            }
        }
        throwError(env, error.what());
        return nullptr;
    } catch (...) {
        throwError(env, "Unknown exception mounting Valdi Harmony host");
        return nullptr;
    }
}


napi_value resize(napi_env env, napi_callback_info info) {
    try {
        Arguments args(env, info, 3);
        auto& host = findHost(*args.environment, handle(env, args.values[0]));
        const auto width = number(env, args.values[1], "width", 1000000, true);
        const auto height = number(env, args.values[2], "height", 1000000, true);
        host.resize(readConfiguration(env, host.resourceManager(), width, height, host.configuration().scale));
        return undefined(env);
    } catch (const std::exception& error) {
        throwError(env, error.what());
        return nullptr;
    } catch (...) {
        throwError(env, "Unknown exception resizing Valdi Harmony host");
        return nullptr;
    }
}

napi_value setInsets(napi_env env, napi_callback_info info) {
    try {
        Arguments args(env, info, 2);
        auto& host = findHost(*args.environment, handle(env, args.values[0]));
        napi_valuetype type;
        check(napi_typeof(env, args.values[1], &type), "Cannot inspect navigation insets");
        if (type != napi_object) throw std::invalid_argument("insets must be an object");
        auto edge = [&](const char* key) {
            napi_value value;
            check(napi_get_named_property(env, args.values[1], key, &value), "Missing navigation inset");
            return number(env, value, key, 1000000, true);
        };
        NavigationInsets insets{edge("top"), edge("bottom"), edge("left"), edge("right"), edge("tabBarHeight")};
        host.setInsets(insets);
        return undefined(env);
    } catch (const std::exception& error) {
        throwError(env, error.what());
        return nullptr;
    } catch (...) {
        throwError(env, "Unknown exception updating navigation insets");
        return nullptr;
    }
}

napi_value setActive(napi_env env, napi_callback_info info) {
    try {
        Arguments args(env, info, 2);
        auto& host = findHost(*args.environment, handle(env, args.values[0]));
        bool active = false;
        check(napi_get_value_bool(env, args.values[1], &active), "active must be a boolean");
        const auto& configuration = host.configuration();
        host.setActive(active, readConfiguration(env, host.resourceManager(),
                                                 configuration.width, configuration.height, configuration.scale));
        return undefined(env);
    } catch (const std::exception& error) {
        throwError(env, error.what());
        return nullptr;
    } catch (...) {
        throwError(env, "Unknown exception updating Valdi Harmony activity");
        return nullptr;
    }
}

napi_value keyboardHeightChanged(napi_env env, napi_callback_info info) {
    try {
        Arguments args(env, info, 2);
        auto& host = findHost(*args.environment, handle(env, args.values[0]));
        host.setKeyboardHeight(number(env, args.values[1], "keyboardHeight", 1000000, true));
        return undefined(env);
    } catch (const std::exception& error) {
        throwError(env, error.what());
        return nullptr;
    } catch (...) {
        throwError(env, "Unknown exception updating keyboard height");
        return nullptr;
    }
}

napi_value destroy(napi_env env, napi_callback_info info) {
    try {
        Arguments args(env, info, 1);
        const auto id = handle(env, args.values[0]);
        findHost(*args.environment, id);
        napi_value promise;
        napi_deferred deferred;
        check(napi_create_promise(env, &deferred, &promise), "Cannot create destroy promise");
        startDestroy(args.environment, id, deferred);
        return promise;
    } catch (const std::exception& error) {
        throwError(env, error.what());
        return nullptr;
    } catch (...) {
        throwError(env, "Unknown exception destroying Valdi Harmony host");
        return nullptr;
    }
}

// Snapshot is fixed native data. Convert directly; no intermediate JSON text
// or ArkTS parser, and never expose an opaque Valdi/JS-backed object to NAPI.
napi_value navigationValue(napi_env env, const Valdi::Value& value, size_t depth = 0) {
    if (depth > 64) throw std::runtime_error("Navigation snapshot exceeds depth limit");
    napi_value result = nullptr;
    if (value.isUndefined()) return undefined(env);
    if (value.isNull()) {
        check(napi_get_null(env, &result), "Cannot create navigation null");
    } else if (value.isString()) {
        const auto text = value.toString();
        check(napi_create_string_utf8(env, text.data(), text.size(), &result), "Cannot create navigation string");
    } else if (value.isBool()) {
        check(napi_get_boolean(env, value.toBool(), &result), "Cannot create navigation boolean");
    } else if (value.isNumber()) {
        check(napi_create_double(env, value.toDouble(), &result), "Cannot create navigation number");
    } else if (value.isArray()) {
        const auto* array = value.getArray();
        check(napi_create_array_with_length(env, array->size(), &result), "Cannot create navigation array");
        for (size_t i = 0; i < array->size(); ++i) {
            check(napi_set_element(env, result, i, navigationValue(env, (*array)[i], depth + 1)),
                  "Cannot set navigation array element");
        }
    } else if (value.isMap() || value.isTypedObject()) {
        check(napi_create_object(env, &result), "Cannot create navigation object");
        auto property = [&](const Valdi::StringBox& key, const Valdi::Value& item) {
            if (item.isNullOrUndefined()) return; // Omit absent optional model properties.
            const auto name = key.slowToString();
            check(napi_set_named_property(env, result, name.c_str(), navigationValue(env, item, depth + 1)),
                  "Cannot set navigation property");
        };
        if (value.isMap()) {
            for (const auto& [key, item] : *value.getMap()) property(key, item);
        } else {
            for (const auto& item : *value.getTypedObject()) property(item.name, item.value);
        }
    } else {
        throw std::runtime_error("Navigation snapshot contains unsupported native value");
    }
    return result;
}

void notifyNavigation(Environment* environment, uint64_t id, const Valdi::Value& snapshot) {
    if (environment->closing) {
        return;
    }
    const auto observer = environment->navigationObservers.find(id);
    if (observer == environment->navigationObservers.end()) {
        return;
    }
    napi_handle_scope scope = nullptr;
    if (napi_open_handle_scope(environment->env, &scope) != napi_ok) {
        logNativeError("Cannot open navigation observer scope");
        return;
    }
    napi_value callback = nullptr;
    napi_value receiver = nullptr;
    napi_value argument = nullptr;
    napi_value result = nullptr;
    const auto env = environment->env;
    try {
        check(napi_get_reference_value(env, observer->second, &callback), "Cannot resolve navigation observer");
        check(napi_get_undefined(env, &receiver), "Cannot create navigation observer receiver");
        argument = navigationValue(env, snapshot);
        check(napi_call_function(env, receiver, callback, 1, &argument, &result), "Navigation observer failed");
    } catch (const std::exception& error) {
        // An ArkTS observer must not leave a pending exception on the UI loop.
        bool pending = false;
        napi_is_exception_pending(env, &pending);
        if (pending) {
            napi_value exception = nullptr;
            napi_get_and_clear_last_exception(env, &exception);
        }
        logNativeError(error.what());
    }
    napi_close_handle_scope(env, scope);
}

napi_value watchNavigation(napi_env env, napi_callback_info info) {
    try {
        Arguments args(env, info, 2);
        const auto id = handle(env, args.values[0]);
        auto& host = findHost(*args.environment, id);
        napi_valuetype type;
        check(napi_typeof(env, args.values[1], &type), "Cannot inspect navigation observer");
        if (type != napi_function) {
            throw std::invalid_argument("navigation observer must be a function");
        }
        napi_ref reference = nullptr;
        check(napi_create_reference(env, args.values[1], 1, &reference), "Cannot retain navigation observer");
        auto [entry, inserted] = args.environment->navigationObservers.emplace(id, reference);
        if (!inserted) {
            napi_delete_reference(env, entry->second);
            entry->second = reference;
        }
        host.setNavigationObserver([environment = args.environment, id](const Valdi::Value& snapshot) {
            notifyNavigation(environment, id, snapshot);
        });
        return undefined(env);
    } catch (const std::exception& error) {
        throwError(env, error.what());
        return nullptr;
    } catch (...) {
        throwError(env, "Unknown exception installing navigation observer");
        return nullptr;
    }
}

napi_value back(napi_env env, napi_callback_info info) {
    try {
        Arguments args(env, info, 1);
        auto& host = findHost(*args.environment, handle(env, args.values[0]));
        napi_value result;
        check(napi_get_boolean(env, host.back(), &result), "Cannot create back result");
        return result;
    } catch (const std::exception& error) {
        throwError(env, error.what());
        return nullptr;
    } catch (...) {
        throwError(env, "Unknown exception navigating back");
        return nullptr;
    }
}

napi_value switchTab(napi_env env, napi_callback_info info) {
    try {
        Arguments args(env, info, 2);
        auto& host = findHost(*args.environment, handle(env, args.values[0]));
        size_t length = 0;
        check(napi_get_value_string_utf8(env, args.values[1], nullptr, 0, &length), "route must be a string");
        if (length == 0 || length > 256) {
            throw std::invalid_argument("route must contain 1 to 256 UTF-8 bytes");
        }
        std::string route(length + 1, '\0');
        size_t copied = 0;
        check(napi_get_value_string_utf8(env, args.values[1], route.data(), route.size(), &copied),
              "Cannot read tab route");
        route.resize(copied);
        host.selectTab(route);
        return undefined(env);
    } catch (const std::exception& error) {
        throwError(env, error.what());
        return nullptr;
    } catch (...) {
        throwError(env, "Unknown exception switching tab");
        return nullptr;
    }
}

std::string surfaceKey(napi_env env, napi_value value, const char* name) {
    size_t length = 0;
    check(napi_get_value_string_utf8(env, value, nullptr, 0, &length), name);
    if (length == 0 || length > 256) throw std::invalid_argument(std::string(name) + " exceeds size limit");
    std::string text(length + 1, '\0');
    check(napi_get_value_string_utf8(env, value, text.data(), text.size(), &length), name);
    text.resize(length);
    if (text.find('\0') != std::string::npos) throw std::invalid_argument(std::string(name) + " contains null bytes");
    return text;
}

napi_value registerSurface(napi_env env, napi_callback_info info, bool bar) {
    try {
        Arguments args(env, info, bar ? 2 : 4);
        auto& host = findHost(*args.environment, handle(env, args.values[0]));
        const auto contentValue = args.values[bar ? 1 : 3];
        ArkUI_NodeContentHandle content = nullptr;
        if (OH_ArkUI_GetNodeContentFromNapiValue(env, contentValue, &content) != 0 || content == nullptr) {
            throw std::invalid_argument("surface must be a valid ArkUI NodeContent");
        }
        if (args.environment->contents.count(content) && !host.ownsContent(content)) {
            throw std::invalid_argument("NodeContent is owned by another host or being destroyed");
        }
        const auto shellId = bar ? "" : surfaceKey(env, args.values[1], "shellId");
        const auto route = bar ? "" : surfaceKey(env, args.values[2], "route");
        args.environment->contents.emplace(content);
        try {
            if (bar) host.registerTabBarSurface(contentValue, content);
            else host.registerTabSurface(shellId, route, contentValue, content);
        } catch (...) {
            // Once retained, the surface remains reserved through async destroy,
            // even when registration failed after creating/mounting native state.
            if (!host.ownsContent(content)) args.environment->contents.erase(content);
            throw;
        }
        return undefined(env);
    } catch (const std::exception& error) {
        throwError(env, error.what());
        return nullptr;
    } catch (...) {
        throwError(env, "Unknown exception registering tab surface");
        return nullptr;
    }
}

napi_value registerTabSurface(napi_env env, napi_callback_info info) {
    return registerSurface(env, info, false);
}

napi_value registerTabBarSurface(napi_env env, napi_callback_info info) {
    return registerSurface(env, info, true);
}

napi_value registerSheetSurface(napi_env env, napi_callback_info info) {
    try {
        Arguments args(env, info, 2);
        auto& host = findHost(*args.environment, handle(env, args.values[0]));
        ArkUI_NodeContentHandle content = nullptr;
        if (OH_ArkUI_GetNodeContentFromNapiValue(env, args.values[1], &content) != 0 || !content)
            throw std::invalid_argument("sheet surface must be a valid ArkUI NodeContent");
        if (args.environment->contents.count(content) && !host.ownsContent(content))
            throw std::invalid_argument("NodeContent is owned by another host or being destroyed");
        args.environment->contents.emplace(content);
        try {
            host.registerSheetSurface(args.values[1], content);
        } catch (...) {
            if (!host.ownsContent(content)) args.environment->contents.erase(content);
            throw;
        }
        return undefined(env);
    } catch (const std::exception& error) {
        throwError(env, error.what());
        return nullptr;
    } catch (...) {
        throwError(env, "Unknown exception registering sheet surface");
        return nullptr;
    }
}

napi_value setSheetWindowMetrics(napi_env env, napi_callback_info info) {
    try {
        Arguments args(env, info, 5);
        auto& host = findHost(*args.environment, handle(env, args.values[0]));
        const auto fullHeight = number(env, args.values[1], "fullWindowHeight", 1000000, true);
        const auto viewport = number(env, args.values[2], "availableViewportHeight", 1000000, true);
        const auto keyboard = number(env, args.values[3], "keyboardOverlap", 1000000, true);
        const auto bottom = number(env, args.values[4], "systemBottom", 1000000, true);
        host.setSheetWindowMetrics(static_cast<float>(fullHeight), static_cast<float>(viewport),
                                   static_cast<float>(keyboard), static_cast<float>(bottom));
        return undefined(env);
    } catch (const std::exception& error) {
        throwError(env, error.what());
        return nullptr;
    } catch (...) {
        throwError(env, "Unknown exception updating sheet geometry");
        return nullptr;
    }
}

void cleanup(napi_async_cleanup_hook_handle hook, void* data) {
    auto* environment = static_cast<Environment*>(data);
    environment->cleanup = hook;
    environment->closing = true;
    // startDestroy removes active entries. Existing destroy jobs keep their host
    // and environment alive and skip promise settlement after cleanup begins.
    while (!environment->hosts.empty()) {
        try {
            startDestroy(environment, environment->hosts.begin()->first);
        } catch (const std::exception& error) {
            logNativeError(error.what());
            // Runtime teardown cannot safely be performed on this UI thread.
            // Retain the async cleanup hook rather than free live worker state.
            return;
        }
    }
    maybeFinishCleanup(environment);
}

napi_value initialize(napi_env env, napi_value exports) {
    try {
        auto state = std::make_unique<Environment>();
        state->env = env;
        check(napi_get_uv_event_loop(env, &state->loop), "Cannot obtain owning NAPI UI event loop");
        state->dispatcher = Valdi::makeShared<HarmonyMainThreadDispatcher>(state->loop);
        if (napi_add_async_cleanup_hook(env, cleanup, state.get(), &state->cleanup) != napi_ok) {
            state->dispatcher->close({});
            throw std::runtime_error("Cannot install asynchronous Valdi Harmony cleanup hook");
        }
        HarmonyOTAProcess::retainEnvironment();
        state->otaEnvironmentRetained = true;
        auto* data = state.release();
        const napi_property_descriptor descriptors[] = {
            {"mount", nullptr, mount, nullptr, nullptr, nullptr, napi_default, data},
            {"resize", nullptr, resize, nullptr, nullptr, nullptr, napi_default, data},
            {"setInsets", nullptr, setInsets, nullptr, nullptr, nullptr, napi_default, data},
            {"setActive", nullptr, setActive, nullptr, nullptr, nullptr, napi_default, data},
            {"keyboardHeightChanged", nullptr, keyboardHeightChanged, nullptr, nullptr, nullptr, napi_default, data},
            {"destroy", nullptr, destroy, nullptr, nullptr, nullptr, napi_default, data},
            {"watchNavigation", nullptr, watchNavigation, nullptr, nullptr, nullptr, napi_default, data},
            {"back", nullptr, back, nullptr, nullptr, nullptr, napi_default, data},
            {"switchTab", nullptr, switchTab, nullptr, nullptr, nullptr, napi_default, data},
            {"registerTabSurface", nullptr, registerTabSurface, nullptr, nullptr, nullptr, napi_default, data},
            {"registerTabBarSurface", nullptr, registerTabBarSurface, nullptr, nullptr, nullptr, napi_default, data},
            {"registerSheetSurface", nullptr, registerSheetSurface, nullptr, nullptr, nullptr, napi_default, data},
            {"setSheetWindowMetrics", nullptr, setSheetWindowMetrics, nullptr, nullptr, nullptr, napi_default, data},
        };
        check(napi_define_properties(env, exports, sizeof(descriptors) / sizeof(descriptors[0]), descriptors),
              "Cannot export Valdi Harmony NAPI APIs");
        return exports;
    } catch (const std::exception& error) {
        throwError(env, error.what());
        return nullptr;
    } catch (...) {
        throwError(env, "Unknown exception initializing Valdi Harmony NAPI module");
        return nullptr;
    }
}

napi_module module = {
    1, 0, nullptr, initialize, "valdi_harmony", nullptr, {nullptr, nullptr, nullptr, nullptr}
};

} // namespace
} // namespace ValdiHarmony

extern "C" __attribute__((constructor)) void RegisterValdiHarmonyModule() {
    napi_module_register(&ValdiHarmony::module);
}
