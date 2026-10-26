import { PageContext, PageViewModel } from './Page';

/** 'sheet' has a fixed height and shrinks its page for the keyboard; 'compactSheet' rides up with it. */
export type Presentation = 'push' | 'sheet' | 'compactSheet';
export type FormLayout = 'scroll' | 'plain';

/** Params and results of every route; the host only sees them as JSON. */
export interface RouteParams {
  home: Record<string, never>;
  detail: { id: number; from: string };
  form: { layout: FormLayout };
  picker: { selected?: string };
}

export interface RouteResults {
  home: never;
  detail: { visited: number };
  form: { summary: string };
  picker: { value: string };
}

export type RouteName = keyof RouteParams;

interface RouteDefinition {
  kind: 'valdi' | 'native';
  title: string;
  /** Valdi component path, `ComponentName@module/path`. */
  component?: string;
}

export const ROUTES: Record<RouteName, RouteDefinition> = {
  home: { kind: 'valdi', title: '首页', component: 'HomePage@app_pages/src/HomePage' },
  detail: { kind: 'valdi', title: '详情', component: 'DetailPage@app_pages/src/DetailPage' },
  form: { kind: 'valdi', title: '表单', component: 'FormPage@app_pages/src/FormPage' },
  picker: { kind: 'native', title: '原生选择页' },
};

/**
 * The host reads the route table from TS, so pages are declared in one place.
 *
 * @ExportFunction({ios: 'VRRoutes', android: 'io.valdiroutes.pages.Routes'})
 */
export function getRoutesJson(): string {
  return JSON.stringify(ROUTES);
}

export function readParams<R extends RouteName>(viewModel: PageViewModel): RouteParams[R] {
  return JSON.parse(viewModel.paramsJson || '{}') as RouteParams[R];
}

export class Router {
  constructor(private readonly context: PageContext) {}

  push<R extends RouteName>(route: R, params: RouteParams[R], presentation: Presentation = 'push'): void {
    this.context.push(route, JSON.stringify(params), presentation);
  }

  pushForResult<R extends RouteName>(
    route: R,
    params: RouteParams[R],
    presentation: Presentation = 'push',
  ): Promise<RouteResults[R] | undefined> {
    return new Promise(resolve => {
      this.context.pushForResult(route, JSON.stringify(params), presentation, (resultJson, canceled) => {
        resolve(canceled ? undefined : (JSON.parse(resultJson) as RouteResults[R]));
      });
    });
  }

  finish<R extends RouteName>(result: RouteResults[R]): void {
    this.context.finish(JSON.stringify(result));
  }

  back(): void {
    this.context.back();
  }
}
