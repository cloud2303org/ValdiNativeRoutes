import res from 'app_pages/res';
import { CalculatorComponent } from 'calculator/src/CalculatorComponent';
import { BlePage } from './features/bluetooth/BlePage';
import { DetailPage } from './features/detail/DetailPage';
import { DevicePage } from './features/device/DevicePage';
import { FormPage } from './features/form/FormPage';
import { HomePage } from './features/home/HomePage';
import { InputCheckPage } from './features/inputs/InputCheckPage';
import { LottiePage } from './features/lottie/LottiePage';
import type { FormLayout } from './features/form/types';
import { defineRoutes, nativePage, valdiPage } from 'app_foundation/src/navigation/config';
import { PresentationPage } from './features/presentation/PresentationPage';
import { RouteAnimationPage } from './features/navigation/RouteAnimationPage';
import { VisionPage } from './features/vision/VisionPage';
import { VideoPage } from './features/video/VideoPage';
import { WheelPage } from './features/wheels/WheelPage';
import { WebViewPage } from './features/webview/WebViewPage';

export const routes = defineRoutes({
  navigation: {
    animation: 'default',
    android: { animation: 'slideRight', durationMs: 300 },
  },
  pages: {
    inputCheck: valdiPage({ component: InputCheckPage, title: '输入自检' }),
    home: valdiPage({ component: HomePage, title: '首页' }),
    detail: valdiPage<{ id: number; from: string }, { visited: number }>({ component: DetailPage, title: '详情' }),
    form: valdiPage<{ layout: FormLayout }, { summary: string }>({ component: FormPage, title: '表单' }),
    picker: nativePage<{ selected?: string }, { value: string }>({ name: 'picker', title: '原生选择页' }),
    ble: valdiPage({ component: BlePage, title: '蓝牙' }),
    presentation: valdiPage({ component: PresentationPage, title: '选择与展示' }),
    vision: valdiPage({ component: VisionPage, title: 'OpenCV 与 ncnn' }),
    animation: valdiPage<{ animation: string }>({ component: RouteAnimationPage, title: '路由动画' }),
    device: valdiPage({ component: DevicePage, title: 'Wi-Fi 与 NFC' }),
    wheels: valdiPage({ component: WheelPage, title: '页面内滚轮' }),
    calculator: valdiPage({ component: CalculatorComponent, title: 'Calculator' }),
    webview: valdiPage({ component: WebViewPage, title: 'WebView' }),
    lottie: valdiPage({ component: LottiePage, title: 'Lottie 动画' }),
    video: valdiPage({ component: VideoPage, title: '原生视频播放器' }),
  },
  tabs: {
    initial: 'home',
    items: [
      { route: 'home', text: '首页', icon: res.tabHome, selectedIcon: res.tabHomeOn },
      { route: 'wheels', text: '组件', icon: res.tabComponents, selectedIcon: res.tabComponentsOn },
      { route: 'device', text: '设备', icon: res.tabDevice, selectedIcon: res.tabDeviceOn },
    ],
  },
});
