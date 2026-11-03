# 路由声明与原生页面

App 的唯一声明是 `valdi/modules/app_pages/src/routes.ts`。导航调用从 `./navigation` 导入；
不再提供 `ROUTES`、`TAB_BAR` 或手写组件路径的旧声明方式。

```ts
import res from 'app_pages/res';
import { defineRoutes, valdiPage, nativePage } from './navigation/config';
import { HomePage } from './HomePage';
import { DetailPage } from './DetailPage';

export const routes = defineRoutes({
  pages: {
    home: valdiPage({ component: HomePage, title: '首页' }),
    detail: valdiPage<{ id: number }, { visited: number }>({
      component: DetailPage,
      title: '详情',
    }),
    chooseDevice: nativePage<{ selected?: string }, { value: string }>({
      name: 'picker',
      title: '选择设备',
    }),
  },
  tabs: {
    initial: 'home',
    items: [
      { route: 'home', text: '首页', icon: res.tabHome, selectedIcon: res.tabHomeOn },
    ],
  },
});
```

`tabs` 存在就生成 App 的 Tab 容器。`tabs.initial` 只控制首次选中哪个 Tab，省略时选择
`items` 第一项。它必须出现在 `items` 中，切换后保留选择和已创建页面。App 启动/登录
逻辑独立决定是否先显示登录页；登录后调用 `router.resetToTabs()`，也可指定默认选中项：
`router.resetToTabs('device')`。没有 Tabs 时，可用顶层 `initial` 指定启动页，省略则使用
第一个声明的页面。Tab 容器使用内部标识 `$tabs`，不需要手动声明 `main` 页面。

```ts
import { router } from './navigation';

router.push('home');                         // 空参数可以省略
router.push('detail', { id: 123 });           // 参数/路由名自动补全
const result = await router.pushForResult('chooseDevice');
router.switchTab('home');
```

页面自己的 `Router`、`readParams` 和 `NavigationOptions` 也从 `./navigation` 导入。
`finish<'detail'>({ visited: 123 })` 返回结果，取消/离开页面则调用方得到 `undefined`。

## 开发校验

- 编辑器/TS 检查页面和 Tab 名称、`tabs.initial`、调用参数和返回值使用。
- Node 编译检查重复项、导出的 `@Component` 引用、真实图片和旧声明格式，报错附文件位置。
- 页面声明及 Tabs 使用静态对象/数组，页面必须用 `valdiPage()` / `nativePage()` 声明。
- `pnpm dev` 有类型错误时拒绝这次更新，连接中的 App 保留上一份有效代码；修正后继续更新。
- 动态导航在调用处检查路由/Tab；宿主解析表时检查原生注册，并对未知路由明确报错。
- 启动声明、路由更新、导航选项、参数、返回值和当前页面栈通过 Valdi 生成模型与字典
  marshaller 传递，路由协议不再编码/解析 JSON 字符串。公开 router 保留页面特定泛型，
  它约束调用方，不替代 Kotlin/Swift 编译或原生返回字段的业务校验。
- 参数/结果在边界递归校验并复制，只允许普通字典、数组、字符串、有限数字、布尔值和
  `null`；可选字典字段的 `undefined` 被省略。函数、访问器、实例和循环引用会明确报错，
  调用方后续修改原对象不会修改已提交的数据。

组件引用在 Node 编译时转成 canonical 路径，消费引用后移除无用的组件导入。
路由表不会为了注册页面提前执行所有页面，页面仍由 Valdi loader 按需加载。
跨 module 的组件必须来自已启用的 module；不改变 `.valdimodule` 的模块划分。

## 原生页面

`nativePage({ name: 'picker' })` 的 `name` 是原生注册标识，可与 App 路由名不同。
现有页面可以直接手写，不强制使用脚手架。Android 在 `NativeScreens.registerDefaults()`
中注册，`App.onCreate()` 调用一次：

```kt
register("picker") { PickerPage(it) }
```

iOS 的 `NativeScreens.registerDefaults()` 返回页面工厂字典：

```swift
["picker": { UIHostingController(rootView: PickerScreen(page: $0)) }]
```

页面接收 `NativePage`，读取结构化字典 `params`，使用 `finish(result)` 返回字典或用
`back()` 取消。取消回调传空字典加 `canceled=true`，JS 调用方得到 `undefined`。
可以注册多个页面；新增/修改原生 UI 和注册代码后需要重新构建 App。
这里没有新增原生页面脚手架、npm 原生自动发现或独立 module 页面工厂自动注册协议。

Valdi TSX 页面在 iOS 使用官方 `loadView(withComponentPath:...)` 通用创建 API，
Android 使用官方 `inflateViewAsync`；无需在宿主为每个 TSX 页面增加创建分支。

## Tab 图片与更新

Tab 图标直接写 `app_pages/res` 的 `res.xxx`。编译器解析真实文件并生成原生资源名，
不支持其他 module、网络图片或动态计算出来的 Tab 图标表达式。

普通构建/OTA 使用现有“OTA 图片优先、安装包资源兜底”路径。开发构建将 Tab 图片字节
放进生成的路由描述，修改图片会重新生成描述并通知原生底栏，不需要重新编译原生资源。
路由/Tab/图标配置变化时，开发宿主重建当前根页面、清除被覆盖的导航栈，并尽量保留
当前根路由和已选中的 Tab；普通页面 TS 热重载不触发这次配置重建。

`defineRoutes()` 仅构建和校验声明，没有原生发布副作用；`routes.toHost(root?)` 返回
固定的 `RouteDeclaration`，其中 `routes` 为 `RouteEntry[]`。同步 `startApp` 先安装错误
处理器，再初始化服务/数据库和 token store，最后选择登录页或 Tab 根并返回声明。
开发启动在 App 作用域使用官方 `ModuleLoader.onHotReload` 监听路由模块；模块卸载后
重新读取 routes/auth 并调用 `routes.publish(root?)`。观察 App 模块卸载时官方 loader
清理监听器。需要手动更新配置时同样显式调用 `publish`。

固定模型、原生构造器、schema 和当前导出器动态字典类型的限制见
[typed-routing-contract.md](typed-routing-contract.md)。公开参数/结果类型仍为严格的
页面泛型；仅生成绑定的 ABI 处使用当前官方导出器支持的 `any` 字典拼写。

SQLite 连接由 `startApp` 初始化并保存在当前 JS runtime 中，跨模块热重载继续使用，
不会在页面重建时重新打开到页面作用域。修改数据库接口或 schema 后应重新启动 App。

OTA 仍按已启用模块收集多个 `.valdimodule` 及图片，没有改成只更新 `app_pages`。
更新在下一次冷启动生效；Kotlin/Swift/C++ 实现仍在安装包中。
