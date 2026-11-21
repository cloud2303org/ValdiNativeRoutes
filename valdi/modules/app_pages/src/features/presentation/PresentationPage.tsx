import type { PageContext, PageViewModel } from 'app_foundation/src/page/Page';
import { BottomSheetProvider, ModalBottomSheet } from 'app_ui/src/bottom_sheet/index';
import { createSignal, For } from 'solid-js';
import type { SolidPageProps } from 'solid_native/src/bridge';
import { Style } from 'valdi_core/src/Style';
import { systemFont, systemSemiboldFont } from 'valdi_core/src/SystemFont';
import type { ImageView, Label, ScrollView, View } from 'valdi_tsx/src/NativeTemplateElements';
import { Button } from '../../components/Button';
import { PageHeader } from '../../components/PageHeader';
import { usePageStatusBar } from '../../components/usePageStatusBar';
import { color, tokens } from '../../components/theme';
import { Router } from '../../router';
import { ApiError, api } from '../../services/api';

const PHOTOS = [
  'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=1200',
  'https://images.unsplash.com/photo-1472396961693-142e6e269027?w=1200',
  'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=1200',
];

/**
 * After ExpoNativeRoutes' app-api "选择与展示" section: native presentations go through `api`
 * (queued with showModal), while custom bottom sheets mount declaratively via `ModalBottomSheet`.
 */
export function PresentationPage(props: SolidPageProps<PageViewModel, PageContext>) {
  const router = new Router(props.context);
  usePageStatusBar(props, 'auto');

  const [location, setLocation] = createSignal('inlet');
  const [sampleDate, setSampleDate] = createSignal('2026-10-02');
  const [result, setResult] = createSignal('还没有结果');
  /** Picked by chooseImage; shown below and previewed on tap. */
  const [chosen, setChosen] = createSignal<string[]>([]);
  const [sheetOpen, setSheetOpen] = createSignal(false);

  const show = (value: unknown) => {
    setResult(JSON.stringify(value));
  };

  const handleBack = () => {
    router.back();
  };

  const handleSheetCancel = () => {
    if (!sheetOpen()) return;
    setSheetOpen(false);
    show({ confirm: false, cancel: true });
  };

  const handleSheetConfirm = () => {
    setSheetOpen(false);
    show({ confirm: true, cancel: false });
  };

  const handlePhoto = async (current: string) => {
    try {
      show(await api.previewImage({ urls: PHOTOS, current }));
    } catch (error) {
      setResult((error as ApiError).errMsg ?? String(error));
    }
  };

  const handleChosen = async (current: string) => {
    try {
      show(await api.previewImage({ urls: chosen(), current }));
    } catch (error) {
      setResult((error as ApiError).errMsg ?? String(error));
    }
  };

  const handleTap = async (id: string) => {
    try {
      switch (id) {
        case 'action-sheet':
          show(
            await api.showActionSheet({ alertText: '设备操作', itemList: ['查看设备', '复制编号', '分享记录'] }),
          );
          break;
        case 'picker': {
          const reply = await api.showPicker({
            title: '采样位置',
            options: [
              { value: 'inlet', label: '进水口' },
              { value: 'outlet', label: '出水口' },
            ],
            value: location(),
          });
          if (reply.confirm) setLocation(reply.value);
          show(reply);
          break;
        }
        case 'date': {
          const reply = await api.showDatePicker({
            title: '采样日期',
            value: sampleDate(),
            minYear: 2020,
            maxYear: 2030,
          });
          if (reply.confirm) setSampleDate(reply.value);
          show(reply);
          break;
        }
        case 'datetime':
          show(
            await api.showDatePicker({
              title: '采样时间',
              mode: 'datetime',
              value: `${sampleDate()} 09:30`,
              minYear: 2020,
              maxYear: 2030,
            }),
          );
          break;
        case 'sheet':
          setSheetOpen(true);
          break;
        case 'preview':
          show(await api.previewImage({ urls: PHOTOS.slice(0, 2), current: PHOTOS[1] }));
          break;
        case 'choose-image': {
          const reply = await api.chooseImage({ count: 3 });
          setChosen(reply.tempFilePaths);
          show(reply);
          break;
        }
        case 'choose-file':
          show(await api.chooseFile({ count: 2, mimeTypes: ['application/pdf', 'image/*'] }));
          break;
        case 'scan':
          show(await api.scanCode());
          break;
        case 'clear-cache':
          setChosen([]);
          show(await api.clearAttachmentCache());
          break;
        case 'mixed':
          show(
            await Promise.all([
              api.showModal({ title: '开始采样', content: '确认后选择采样位置。' }),
              api.showPicker({ title: '采样位置', options: ['进水口', '出水口'] }),
              api.showModal({ title: '完成记录', content: '采样步骤已结束，请检查记录。', showCancel: false }),
            ]),
          );
          break;
      }
    } catch (error) {
      setResult((error as ApiError).errMsg ?? String(error));
    }
  };

  const { insets } = props;

  return (
    <BottomSheetProvider>
      <view style={styles.page}>
        <scroll style={styles.scroll}>
          <view
            paddingTop={insets.top + 12}
            paddingBottom={insets.bottom + 32}
            paddingLeft={insets.left + 20}
            paddingRight={insets.right + 20}
          >
            <PageHeader
              title="选择与展示"
              subtitle="api.showPicker / showDatePicker / ModalBottomSheet …"
              onBack={handleBack}
            />
            <label style={styles.result} numberOfLines={0} value={`结果：${result()}`} />

            <Button id="action-sheet" title="操作菜单 showActionSheet" onTap={handleTap} />
            <Button
              id="picker"
              title={`采样位置：${location() === 'inlet' ? '进水口' : '出水口'}`}
              onTap={handleTap}
            />
            <Button id="date" title={`采样日期：${sampleDate()}`} onTap={handleTap} />
            <Button id="datetime" title="采样时间（datetime）" onTap={handleTap} />
            <Button id="sheet" title="底部弹层 ModalBottomSheet" secondary={true} onTap={handleTap} />
            <Button id="preview" title="图片预览（从第二张开始）" secondary={true} onTap={handleTap} />
            <Button id="mixed" title="连续不同弹层（排队）" secondary={true} onTap={handleTap} />

            <label style={styles.section} value="点缩略图预览" />
            <view style={styles.thumbs}>
              <For each={PHOTOS}>
                {(url, index) => (
                  <image
                    accessibilityId={`photo-${index()}`}
                    accessibilityLabel={`照片 ${index() + 1}，点开预览`}
                    style={styles.thumb}
                    src={url}
                    onTap={() => handlePhoto(url)}
                  />
                )}
              </For>
            </view>

            <label style={styles.section} value="附件与扫码" />
            <Button id="choose-image" title="chooseImage（相册或拍照，最多 3 张）" onTap={handleTap} />
            <Button id="choose-file" title="chooseFile（PDF 或图片，最多 2 个）" onTap={handleTap} />
            <Button id="scan" title="scanCode 扫码" onTap={handleTap} />
            <Button id="clear-cache" title="clearAttachmentCache" secondary={true} onTap={handleTap} />
            <view style={styles.chosen}>
              <For each={chosen()}>
                {(uri, index) => (
                  <image
                    accessibilityId={`chosen-${index()}`}
                    accessibilityLabel={`选中的第 ${index() + 1} 项，点开预览`}
                    style={styles.thumb}
                    src={uri}
                    onTap={() => handleChosen(uri)}
                  />
                )}
              </For>
            </view>
          </view>
        </scroll>

        <ModalBottomSheet
          index={sheetOpen() ? 0 : -1}
          detents={['content']}
          surfaceStyle={{
            backgroundColor: color.surface,
            borderTopLeftRadius: tokens.radius.sheet,
            borderTopRightRadius: tokens.radius.sheet,
          }}
          onIndexChange={index => {
            if (index < 0) handleSheetCancel();
          }}
          onCloseRequest={handleSheetCancel}
        >
          <view
            paddingTop={12}
            paddingBottom={Math.max(insets.bottom, 16) + 8}
            paddingLeft={20}
            paddingRight={20}
          >
            <view style={styles.sheetHandle} />
            <label style={styles.sheetTitle} value="采样说明" />
            <label
              style={styles.sheetBody}
              numberOfLines={0}
              value="请在固定采样点收集水样，记录采样时间并检查设备状态。"
            />
            <Button id="sheet-confirm" title="我知道了" onTap={handleSheetConfirm} />
          </view>
        </ModalBottomSheet>
      </view>
    </BottomSheetProvider>
  );
}

const styles = {
  page: new Style<View>({ width: '100%', height: '100%', backgroundColor: color.canvas }),
  scroll: new Style<ScrollView>({ width: '100%', height: '100%' }),
  result: new Style<Label>({
    color: color.success,
    font: systemFont(tokens.font.section),
    marginBottom: tokens.space.md,
  }),
  section: new Style<Label>({ color: color.muted, font: systemSemiboldFont(tokens.font.section), margin: '12 0 8 0' }),
  thumbs: new Style<View>({ flexDirection: 'row', justifyContent: 'space-between' }),
  chosen: new Style<View>({ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }),
  thumb: new Style<ImageView>({
    width: '31%',
    aspectRatio: 1,
    borderRadius: tokens.radius.control,
    objectFit: 'cover',
    backgroundColor: color.handle,
  }),
  sheetHandle: new Style<View>({
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: color.handle,
    alignSelf: 'center',
    marginBottom: 14,
  }),
  sheetTitle: new Style<Label>({
    color: color.title,
    font: systemSemiboldFont(tokens.font.title),
    marginBottom: 8,
  }),
  sheetBody: new Style<Label>({
    color: color.muted,
    font: systemFont(tokens.font.body),
    marginBottom: 20,
  }),
};
