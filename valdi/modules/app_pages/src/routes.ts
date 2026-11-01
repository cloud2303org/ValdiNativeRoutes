import res from 'app_pages/res';
import { CalculatorComponent } from 'calculator/src/CalculatorComponent';
import { BlePage } from './BlePage';
import { DetailPage } from './DetailPage';
import { DevicePage } from './DevicePage';
import { FormPage } from './FormPage';
import { HomePage } from './HomePage';
import { InputCheckPage } from './InputCheckPage';
import { LoginPage } from './LoginPage';
import type { FormLayout } from './navigation';
import { defineRoutes, nativePage, valdiPage } from './navigation/config';
import { PresentationPage } from './PresentationPage';
import { RouteAnimationPage } from './RouteAnimationPage';
import { VisionPage } from './VisionPage';
import { WheelPage } from './WheelPage';

export const routes = defineRoutes({
  navigation: {
    animation: 'default',
    android: { animation: 'slideRight', durationMs: 300 },
  },
  pages: {
    login: valdiPage({ component: LoginPage, title: '登录' }),
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
