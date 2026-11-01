# Hermes JSI 适配范围

本文对照当前 Valdi fork `a869696a229d61ec3af177f4f27eb2bdc1037a04` 和 Hermes
`260318099.0.4` 的实际接口。以下是迁移接口评估；独立实验后端现已放在本地
`experiment/hermes-jsi` 分支，worktree 为
`/Users/cloud/.config/superpowers/worktrees/Valdi/hermes-jsi`。
实现和复现命令见该 worktree 的 `docs/hermes-jsi-experiment.md`。
应用源码现固定到维护提交 `15feb6530ceecb971f4c8519ea8ab77474b959db`，
其中合入官方上游 `4aa98f01` 并保留原 Hermes 适配器修复；JSI 仍未启用。
设备性能和包体尚未对比。

实验实现现已补上原生 Promise 接管及采用链传递、tracker 记录清理、所属 JS 队列的
主动释放唤醒，以及构建时的 HBC 源码/版本/校验和检查。Promise 的完整接管需要一小处
固定版本的 Hermes 内置 JS 扩展；C++ JSI 后端仍只调用公开接口。
宿主微基准已验证原始值内联编码和快速转换能明显降低初版适配器的边界开销，
具体数据、回归结果及限制以实验 worktree 的说明为准。

## 保留 Valdi 的接口

Valdi 的 `valdi/src/valdi/runtime/Interfaces/IJavaScriptContext.hpp` 已经定义了引擎边界。
页面、JS 模块加载器、绑定生成器、C++ 布局引擎和 Worker 调度都不需要改成 JSI API。
新增 Hermes 专用实现，在这个接口下使用 JSI 和公开 Hermes 扩展即可。

当前 `HermesJavaScriptContext` 直接使用 `hermes::vm::Runtime`、`HermesValue`、
`PinnedHermesValue`、`GCScope`、`NativeConstructor`、`FinalizableNativeFunction`、
`JSObject`、`JSTypedArrayBase` 和 `BCProvider` 等内部类型。这些依赖是升级时需要持续适配的部分。

## 上层实际需要的方法及对应方式

1. **模块执行**：`evaluate`、`evaluatePreCompiled`、`preCompile`。
   JSI 的 `evaluateJavaScript` 接受源码或 Hermes HBC；`prepareJavaScript` 和
   `evaluatePreparedJavaScript` 可复用准备后的代码，但不提供字节码序列化。
   保留现有 Valdi 模块包装、四字节标记和 Node `hermesc` 发布编译流程。

2. **基本值和属性名**：`newBool/newNumber/newNull/newUndefined`、
   `newStringUTF8/newStringUTF16`、`newPropertyName/propertyNameToString`、
   `getValueType` 和 `isValue*`。
   分别使用 JSI `Value`、`String`、`PropNameID` 及类型查询。
   JSI 的取值接口不自动等于 JS 强制类型转换；布尔/数字/整数转换需要明确保持既定语义。
   Valdi 的 Long 包装也需要保留，不能直接替换成 JS BigInt。

3. **对象、数组和属性**：`newObject/newArray`、`getObjectProperty`、
   `setObjectProperty`、索引访问、属性枚举和相等比较。
   JSI `Object/Array`、get/set/has、`getPropertyNames`、`strictEquals` 可以覆盖主要操作。
   不可枚举属性、getter/setter 和完整 descriptor 标志通过预先捕获的 JS intrinsic 实现。

4. **原生函数和调用**：`newFunction`、`valueToFunction`、
   `callObjectAsFunction/callObjectAsConstructor`。
   使用 `Function::createFromHostFunction`、HostFunction 数据及 `Function::call/callAsConstructor`。
   异常在 JSI `JSError` 与 `JSExceptionTracker` 之间转换。

5. **原生对象和类**：`newWrappedObject/valueToWrappedObject`、
   `newNativeClass/newObjectFromNativeClass`。
   对象使用公开 `NativeState` 持有原生实例；不能把所有对象都机械地换成 HostObject。
   HostFunction 的参数没有 constructor-call 标志和 `new.target`，需要小型 JS 构造器包装，
   保留必须通过 `new` 调用、禁止未支持的继承、原型和静态/实例成员语义。
   包装函数应预编译为 HBC，使 lean Release 不必引入源码编译器。

6. **二进制数据**：`newArrayBuffer`、`newTypedArrayFromArrayBuffer`、`valueToTypedArray`。
   当前 JSI 提供 `TypedArray::buffer/byteOffset/byteLength/length` 和
   `ArrayBuffer::data/size/detached`，可以保留零拷贝并持有 backing buffer。
   `MutableBuffer` 可承接原生持有的外部内存。`tryGetMutableBuffer` 不是所有 JS buffer 都有，
   不应把它作为通用必要条件。
   当前公开 API 缺少通用 TypedArray kind 查询；可在应用执行前捕获
   `%TypedArray%.prototype[Symbol.toStringTag]` getter 进行类型识别，并缓存各类型构造器。
   不使用可被应用改写的 `constructor.name` 判断。

7. **生命周期和 GC**：`retainValue/releaseValue`、属性名 retain/release、
   `newWeakRef/derefWeakRef`、`garbageCollect/dumpMemoryStatistics/dumpHeap`。
   JSI 持有值句柄，`WeakObject` 提供弱引用；Valdi 仍需要自己的句柄引用计数、线程与 teardown 约束。
   通过 `instrumentation().collectGarbage/getHeapInfo/createSnapshotToStream` 接入诊断，
   并根据构建能力返回明确的不支持错误。

8. **任务和终止**：`willEnterVM/willExitVM`、`enqueueMicrotask`、
   `requestExecutionTermination`、Promise rejection listener。
   使用 `queueMicrotask/drainMicrotasks`，保留 Valdi 的 VM 重入计数和 sticky termination 状态。
   公开 `IHermes::asyncTriggerTimeout` 可从其他线程中断纯 JS；源码编译需启用
   `AsyncBreakCheckInEval`，外部 HBC 需继续带 async-break checks。
   它不能抢占阻塞中的任意原生代码。Promise rejection 仍需显式转发到 Valdi listener。

## Hermes 特有能力与构建

调试器继续使用公开 `CDPAgent/CDPDebugAPI`，端口、消息传输和 Worker 归属仍由 Valdi 管理。
`isInspectable()` 本身不提供这些服务。CPU profiling 使用公开 Hermes root/runtime 扩展。

当前构建已有 `hermes_api_lean`：JSI 实现不带 CDP 源码，可以与 `hermes_lean` 配合。
开发构建继续选择完整 VM/API。原适配器的 Release 路径不链接 `hermes_api_lean`；
实验分支已增加对应选择，启用 `hermes_use_jsi=true` 后使用 JSI 后端。
实际包体增量仍需应用产物测量。

如需保留 runtime 内 `preCompile`，公开 `hermes/CompileJS.h` 有 `compileJS`，但当前 Bazel
`API_SRCS` 没包含 `CompileJS.cpp`。实验分支已为 full 构建单独添加公开 compiler target，
其参数行为仍需要与现有编译器单独对齐。
发布编译继续使用现有 Node 适配器即可，不应为了它给 lean Release 加回编译器。

上述能力可以通过公开 API 组合实现；迁移完成后不必继续调用被 Hermes 明确标为不稳定的
`getVMRuntimeUnsafe()`。JSI 仍需与 Hermes 版本及 C++ ABI 对齐，并非跨版本二进制兼容保证。

## 验证顺序

先用现有适配器的修复与回归测试建立行为基线，再加入独立 JSI 后端并运行同一组测试。
优先验证值和异常、HostFunction/NativeState、TypedArray 偏移与持有、原生构造器和 descriptor、
Promise 重入/rejection、Worker 中断，以及 Node 输出的 HBC 在 full/lean 下的装载。
之后再比较实际页面的 Release 冷启动、更新耗时、内存和产物大小，决定是否切换默认实现。

## 核对的源码

- Valdi：`valdi/src/valdi/runtime/Interfaces/IJavaScriptContext.hpp`。
- 当前适配：`valdi/src/valdi/hermes/HermesJavaScriptContext.{hpp,cpp}`、`HermesUtils.cpp`。
- JSI：Hermes `API/jsi/jsi/jsi.h`、`instrumentation.h`。
- 公开 Hermes 扩展：`API/jsi/jsi/hermes-interfaces.h`、`API/hermes/hermes.h`、`CompileJS.h`。
- 构建：Valdi `third-party/hermes_v1/hermes.BUILD` 和 `valdi/BUILD.bazel`。
