# 路由声明与原生页面

App 的唯一声明是 `valdi/modules/app_pages/src/routes.ts`。导航调用从 `app_pages/src/router` 导入；
不再提供 `ROUTES`、`TAB_BAR` 或手写组件路径的旧声明方式。

通用路由实现位于 `app_foundation/src/navigation/router.ts`：`createRouter(routes)` 提供
`push`、`pushForResult`、`replace`、`back`、`popToRoot`、`reset`、Tab 操作、页面栈查询
及参数读取；基础层 `Router` 提供单页的跳转、`finish` 和 `back`。Foundation 不导入应用页面。
`app_pages/src/router.ts` 只创建当前应用的实例、导出从路由表推导的类型，并把页面句柄
绑定到这个实例，因此现有页面的调用方式不变。其他应用可用自己的 `defineRoutes()` 结果独立绑定：

```ts
import { createRouter } from 'app_foundation/src/navigation/router';
import { routes } from './routes';

export const router = createRouter(routes);
```

参数校验、Promise/取消结果转换和转场选项合并由基础层负责；路由名、页面参数/结果、
Tab 配置及启动根页面由应用负责。实际页面栈和转场仍由 Kotlin/Swift 宿主执行。

```ts
import res from 'app_pages/res';
import { defineRoutes, valdiPage, nativePage } from 'app_foundation/src/navigation/config';
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
`items` 第一项。它必须出现在 `items` 中，切换后保留选择和已创建页面。当前 App
直接以 `routes.home = '$tabs'` 启动，由 `tabs.initial = 'home'` 选中首页。
需要重置导航栈时可调用 `router.resetToTabs()`，也可指定选中项：
`router.resetToTabs('device')`。没有 Tabs 时，可用顶层 `initial` 指定启动页，省略则使用
第一个声明的页面。Tab 容器使用内部标识 `$tabs`，不需要手动声明 `main` 页面。

App 只有一个全局导航栈，Tab 是容器内的单层页面选择，各 Tab 没有独立返回栈。
Android 的内部 `NavDisplay` 只显示一个 Tab entry；首次创建 Valdi Tab 时，当前页面继续
绘制，目标在禁止输入的透明槽中完成初始渲染事务和布局准备，再提交最新选择。
准备过程不阻止窗口绘制，已经初始化的页面复用其 root。此回调表示事务与布局准备完成，
不代表 GPU 已呈现，也不等待页面后续加载的所有图片或网络内容。
iOS 默认使用 `UITabBarController`，每个 Tab 直接持有页面控制器；自定义容器先完成目标
子控制器的挂载与同步布局，再移除原页面。`push` 从当前 Tab 覆盖到全局栈，返回后保留
该 Tab 的选择和页面实例。

```ts
import { router } from 'app_pages/src/router';

router.push('home');                         // 空参数可以省略
router.push('detail', { id: 123 });           // 参数/路由名自动补全
const result = await router.pushForResult('chooseDevice');
router.switchTab('home');
```

页面自己的 `Router`、`RouteViewModel` 和 `NavigationOptions` 也从 `app_pages/src/router` 导入。
`finish<'detail'>({ visited: 123 })` 返回结果，取消/离开页面则调用方得到 `undefined`。
有参页面声明一次对应的 ViewModel 类型后，直接读取 `this.viewModel.params`：

```ts
export class DetailPage extends Page<PageViewModel, State, PageContext> {
  declare readonly viewModel: Readonly<RouteViewModel<'detail'>>;

  onCreate(): void {
    const { id, from } = this.viewModel.params;
  }
}
```

`RouteViewModel` 从路由声明推导 `route` 和 `params`，先移除原生模型的通用字段再替换，
避免 `params: any` 污染页面类型。`declare` 只约束 TS 类型，不生成字段、转换或运行时校验。
组件注解及基类继续引用通用 `PageViewModel`，两端原生绑定不变。
返回结果和页面栈查询也直接使用 marshaller 返回的数据，不再递归检查或重建对象。

## 开发校验

- 编辑器/TS 检查页面和 Tab 名称、`tabs.initial`、调用参数和返回值使用。
- Node 编译检查重复项、导出的 `@Component` 引用、真实图片和旧声明格式，报错附文件位置。
- 页面声明及 Tabs 使用静态对象/数组，页面必须用 `valdiPage()` / `nativePage()` 声明。
- `pnpm dev` 有类型错误时拒绝这次更新，连接中的 App 保留上一份有效代码；修正后继续更新。
- 动态导航在调用处检查路由/Tab；宿主解析表时检查原生注册，并对未知路由明确报错。
- 启动声明、路由更新、导航选项、参数、返回值和当前页面栈通过 Valdi 生成模型与字典
  marshaller 传递，路由协议不再编码/解析 JSON 字符串。公开 router 保留页面特定泛型，
  它约束调用方，不替代 Kotlin/Swift 编译或原生返回字段的业务校验。
- 参数/结果保持原有对象身份交给原生 marshaller。路由根必须是普通字典，
  JS 在发送前递归检查允许值域：拒绝非有限数、环引用、函数、symbol、访问器、
  不支持的容器和稀疏/undefined 数组项；允许非循环的共享引用和可选字典字段。
  验证不序列化为 JSON，也不深拷贝业务对象；原生仍对保存的参数/结果取值快照。

组件引用在 Node 编译时转成 canonical 路径，消费引用后移除无用的组件导入。
路由表不会为了注册页面提前执行所有页面，页面仍由 Valdi loader 按需加载。
跨 module 的组件必须来自已启用的 module；不改变 `.valdimodule` 的模块划分。

## 原生页面

`nativePage({ name: 'picker' })` 的 `name` 是原生注册标识，可与 App 路由名不同。
现有页面可以直接手写，不强制使用脚手架。通用 `NativePage` 和 `NativeScreens`
位于两端 `navigation/` / `Navigation/`。示例页面单独位于
`features/picker/PickerScreen.kt` / `Features/Picker/PickerScreen.swift`，
删除示例时不用改通用注册表。Android 在 `NativeExamples.registerScreens()`
中显式注册，`App.onCreate()` 调用一次：

```kt
NativeScreens.register("picker") { PickerPage(it) }
```

iOS 在 `NativeExamples.registerScreens()` 注册，`AppDelegate` 启动时调用一次：

```swift
NativeScreens.register("picker") { UIHostingController(rootView: PickerScreen(page: $0)) }
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
处理器，再初始化主题、服务和数据库，最后返回默认 Tab 根的声明。
开发启动在 App 作用域使用官方 `ModuleLoader.onHotReload` 监听路由模块；模块卸载后
重新读取 routes 并调用 `routes.publish()`。观察 App 模块卸载时官方 loader
清理监听器。需要手动更新配置时同样显式调用 `publish`。

固定模型、原生构造器、schema 和当前导出器动态字典类型的限制见
[typed-routing-contract.md](typed-routing-contract.md)。公开参数/结果类型仍为严格的
页面泛型；仅生成绑定的 ABI 处使用当前官方导出器支持的 `any` 字典拼写。

SQLite 连接由 `startApp` 初始化并保存在当前 JS runtime 中，跨模块热重载继续使用，
不会在页面重建时重新打开到页面作用域。修改数据库接口或 schema 后应重新启动 App。

OTA 仍按已启用模块收集多个 `.valdimodule` 及图片，没有改成只更新 `app_pages`。
更新在下一次冷启动生效；Kotlin/Swift/C++ 实现仍在安装包中。
