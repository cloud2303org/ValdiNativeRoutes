import Foundation

/// Native source of truth. Constructed once; bridge and native UI read this same token tree.
public final class ThemeTokensStore {
    public static let shared = ThemeTokensStore()
    public let tokens: VRThemeTokens

    private init() {
        tokens = VRThemeTokens(
        light: VRThemeColorTokens(
            canvas: "#f5f7fb",
            surface: "#ffffff",
            ink: "#101828",
            text: "#172033",
            muted: "#667085",
            title: "#233d63",
            section: "#617e9f",
            description: "#7c8fa9",
            chevron: "#8499b6",
            icon: "#377dff",
            hairline: "#ececec",
            border: "#E8ECF1",
            separator: "rgba(77,112,163,0.14)",
            pressed: "rgba(55,125,255,0.10)",
            backPressed: "rgba(16,24,40,0.06)",
            iconWell: "rgba(55,125,255,0.10)",
            primary: "#1e62d0",
            success: "#0ECD9D",
            danger: "#d54941",
            scrim: "rgba(16,24,40,0.32)",
            handle: "#D6DCE5",
            segmentTrack: "#e9edf3",
            segmentIndicator: "#ffffff",
            segmentText: "#606b7a",
            segmentTextActive: "#18263b",
            buttonPrimary: "#1e62d0",
            buttonOnPrimary: "#ffffff",
            buttonSecondary: "#eef2f7",
            buttonOnSecondary: "#1d2939",
            buttonDanger: "#fdecec",
            buttonOnDanger: "#d92d20",
            playerBackground: "#101828"
        ),
        dark: VRThemeColorTokens(
            canvas: "#121316",
            surface: "#1E1F23",
            ink: "#ffffff",
            text: "#ffffff",
            muted: "#969696",
            title: "#ffffff",
            section: "#969696",
            description: "#D5D5D6",
            chevron: "#969696",
            icon: "#377dff",
            hairline: "#2A2B32",
            border: "#2A2B32",
            separator: "#2A2B32",
            pressed: "#2E2F36",
            backPressed: "#2E2F36",
            iconWell: "rgba(55,125,255,0.16)",
            primary: "#377dff",
            success: "#56DCBA",
            danger: "#f56c6c",
            scrim: "rgba(0,0,0,0.75)",
            handle: "#969696",
            segmentTrack: "#1E1F23",
            segmentIndicator: "#454750",
            segmentText: "#D5D5D6",
            segmentTextActive: "#ffffff",
            buttonPrimary: "#377dff",
            buttonOnPrimary: "#ffffff",
            buttonSecondary: "#2c2e35",
            buttonOnSecondary: "#f2f4f7",
            buttonDanger: "rgba(245,108,108,0.18)",
            buttonOnDanger: "#ff8a8a",
            playerBackground: "#101828"
        ),
        shared: VRThemeSharedTokens(
            radius: VRThemeRadiusTokens(
                tiny: 2.0,
                small: 6.0,
                medium: 8.0,
                compact: 10.0,
                control: 12.0,
                icon: 12.0,
                button: 14.0,
                surface: 20.0,
                card: 22.0,
                sheet: 22.0,
                pill: 999.0
            ),
            size: VRThemeSizeTokens(
                nav: 44.0,
                back: 40.0,
                icon: 36.0,
                row: 72.0,
                button: 48.0
            ),
            space: VRThemeSpaceTokens(
                xxs: 2.0,
                xs: 4.0,
                tight: 6.0,
                sm: 8.0,
                section: 10.0,
                md: 12.0,
                lg: 16.0,
                xl: 20.0,
                content: 24.0,
                roomy: 28.0,
                xxl: 32.0,
                wide: 40.0,
                bottom: 48.0
            ),
            font: VRThemeFontTokens(
                nav: 17.0,
                button: 16.0,
                title: 15.0,
                segment: 14.0,
                section: 13.0,
                body: 12.0,
                tiny: 11.0,
                sheetTitle: 20.0,
                heading: 30.0
            ),
            icon: VRThemeIconTokens(
                row: 21.0,
                chevron: 19.0,
                back: 28.0
            ),
            motion: VRThemeMotionTokens(
                pressedOpacity: 0.82,
                pressedScale: 0.97,
                disabledOpacity: 0.4
            )
        )
    )
    }
}
