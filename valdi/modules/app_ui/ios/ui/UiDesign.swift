// Shared design fields read the native ThemeTokensStore; component-only constants remain here.
import UIKit
import ThemeBridge

public enum UiDesign {
  public enum palette {
    public static let blueLight: UIColor = UIColor(red: 55.0 / 255, green: 125.0 / 255, blue: 255.0 / 255, alpha: 1)
    public static let bluePrimary: UIColor = UIColor(red: 30.0 / 255, green: 98.0 / 255, blue: 208.0 / 255, alpha: 1)
    public static let blueDark: UIColor = UIColor(red: 21.0 / 255, green: 73.0 / 255, blue: 168.0 / 255, alpha: 1)
    public static let greenLight: UIColor = UIColor(red: 86.0 / 255, green: 220.0 / 255, blue: 186.0 / 255, alpha: 1)
    public static let greenPrimary: UIColor = UIColor(red: 14.0 / 255, green: 205.0 / 255, blue: 157.0 / 255, alpha: 1)
    public static let greenDark: UIColor = UIColor(red: 10.0 / 255, green: 144.0 / 255, blue: 110.0 / 255, alpha: 1)
    public static let redLight: UIColor = UIColor(red: 245.0 / 255, green: 108.0 / 255, blue: 108.0 / 255, alpha: 1)
    public static let redPrimary: UIColor = UIColor(red: 213.0 / 255, green: 73.0 / 255, blue: 65.0 / 255, alpha: 1)
    public static let redDark: UIColor = UIColor(red: 184.0 / 255, green: 37.0 / 255, blue: 31.0 / 255, alpha: 1)
    public static let grayLight: UIColor = UIColor(red: 241.0 / 255, green: 243.0 / 255, blue: 245.0 / 255, alpha: 1)
    public static let gray: UIColor = UIColor(red: 213.0 / 255, green: 213.0 / 255, blue: 214.0 / 255, alpha: 1)
    public static let grayDark: UIColor = UIColor(red: 150.0 / 255, green: 150.0 / 255, blue: 150.0 / 255, alpha: 1)
    public static let white: UIColor = UIColor(red: 255.0 / 255, green: 255.0 / 255, blue: 255.0 / 255, alpha: 1)
    public static let black: UIColor = UIColor(red: 0.0 / 255, green: 0.0 / 255, blue: 0.0 / 255, alpha: 1)
  }
  public enum light {
    public enum color {
      public static let page: UIColor = UIColor(red: 234.0 / 255, green: 241.0 / 255, blue: 251.0 / 255, alpha: 1)
      public static let canvas: UIColor = themeTokenColor(ThemeTokensStore.shared.tokens.light.canvas)
      public static let surface: UIColor = themeTokenColor(ThemeTokensStore.shared.tokens.light.surface)
      public static let ink: UIColor = themeTokenColor(ThemeTokensStore.shared.tokens.light.ink)
      public static let heading: UIColor = UIColor(red: 32.0 / 255, green: 61.0 / 255, blue: 101.0 / 255, alpha: 1)
      public static let title: UIColor = themeTokenColor(ThemeTokensStore.shared.tokens.light.title)
      public static let subtitle: UIColor = UIColor(red: 114.0 / 255, green: 139.0 / 255, blue: 172.0 / 255, alpha: 1)
      public static let section: UIColor = themeTokenColor(ThemeTokensStore.shared.tokens.light.section)
      public static let description: UIColor = themeTokenColor(ThemeTokensStore.shared.tokens.light.description)
      public static let icon: UIColor = themeTokenColor(ThemeTokensStore.shared.tokens.light.icon)
      public static let chevron: UIColor = themeTokenColor(ThemeTokensStore.shared.tokens.light.chevron)
      public static let hairline: UIColor = themeTokenColor(ThemeTokensStore.shared.tokens.light.hairline)
      public static let onInverse: UIColor = UIColor(red: 255.0 / 255, green: 255.0 / 255, blue: 255.0 / 255, alpha: 1)
      public static let iconWell: UIColor = themeTokenColor(ThemeTokensStore.shared.tokens.light.iconWell)
      public static let pressed: UIColor = themeTokenColor(ThemeTokensStore.shared.tokens.light.pressed)
      public static let separator: UIColor = themeTokenColor(ThemeTokensStore.shared.tokens.light.separator)
      public static let cardBorder: UIColor = UIColor(red: 255.0 / 255, green: 255.0 / 255, blue: 255.0 / 255, alpha: 0.78)
      public static let backPressed: UIColor = themeTokenColor(ThemeTokensStore.shared.tokens.light.backPressed)
      public static let primary: UIColor = themeTokenColor(ThemeTokensStore.shared.tokens.light.primary)
      public static let accent: UIColor = UIColor(red: 55.0 / 255, green: 125.0 / 255, blue: 255.0 / 255, alpha: 1)
      public static let success: UIColor = themeTokenColor(ThemeTokensStore.shared.tokens.light.success)
      public static let text: UIColor = themeTokenColor(ThemeTokensStore.shared.tokens.light.text)
      public static let muted: UIColor = themeTokenColor(ThemeTokensStore.shared.tokens.light.muted)
      public static let subtle: UIColor = UIColor(red: 244.0 / 255, green: 246.0 / 255, blue: 248.0 / 255, alpha: 1)
      public static let border: UIColor = themeTokenColor(ThemeTokensStore.shared.tokens.light.border)
      public static let scrim: UIColor = themeTokenColor(ThemeTokensStore.shared.tokens.light.scrim)
      public static let danger: UIColor = themeTokenColor(ThemeTokensStore.shared.tokens.light.danger)
      public static let error: UIColor = UIColor(red: 213.0 / 255, green: 73.0 / 255, blue: 65.0 / 255, alpha: 1)
      public static let cancelFill: UIColor = UIColor(red: 242.0 / 255, green: 244.0 / 255, blue: 247.0 / 255, alpha: 1)
      public static let cancelText: UIColor = UIColor(red: 67.0 / 255, green: 85.0 / 255, blue: 111.0 / 255, alpha: 1)
      public static let cancelBorder: UIColor = UIColor(red: 228.0 / 255, green: 231.0 / 255, blue: 236.0 / 255, alpha: 1)
      public static let confirmFill: UIColor = UIColor(red: 212.0 / 255, green: 230.0 / 255, blue: 251.0 / 255, alpha: 1)
      public static let confirmText: UIColor = UIColor(red: 22.0 / 255, green: 79.0 / 255, blue: 158.0 / 255, alpha: 1)
      public static let confirmBorder: UIColor = UIColor(red: 203.0 / 255, green: 223.0 / 255, blue: 248.0 / 255, alpha: 1)
      public static let selectedFill: UIColor = UIColor(red: 212.0 / 255, green: 230.0 / 255, blue: 251.0 / 255, alpha: 1)
      public static let dangerFill: UIColor = UIColor(red: 252.0 / 255, green: 229.0 / 255, blue: 232.0 / 255, alpha: 1)
      public static let dangerText: UIColor = UIColor(red: 172.0 / 255, green: 41.0 / 255, blue: 60.0 / 255, alpha: 1)
      public static let dangerBorder: UIColor = UIColor(red: 243.0 / 255, green: 205.0 / 255, blue: 210.0 / 255, alpha: 1)
      public static let disabledFill: UIColor = UIColor(red: 237.0 / 255, green: 241.0 / 255, blue: 247.0 / 255, alpha: 1)
      public static let segmentTrack: UIColor = themeTokenColor(ThemeTokensStore.shared.tokens.light.segmentTrack)
      public static let segmentIndicator: UIColor = themeTokenColor(ThemeTokensStore.shared.tokens.light.segmentIndicator)
      public static let segmentText: UIColor = themeTokenColor(ThemeTokensStore.shared.tokens.light.segmentText)
      public static let segmentTextActive: UIColor = themeTokenColor(ThemeTokensStore.shared.tokens.light.segmentTextActive)
      public static let handle: UIColor = themeTokenColor(ThemeTokensStore.shared.tokens.light.handle)
      public static let dialogShadow: UIColor = UIColor(red: 16.0 / 255, green: 43.0 / 255, blue: 82.0 / 255, alpha: 0.18)
      public static let segmentShadow: UIColor = UIColor(red: 24.0 / 255, green: 39.0 / 255, blue: 63.0 / 255, alpha: 0.12)
      public static let floatingCloseFill: UIColor = UIColor(red: 0.0 / 255, green: 0.0 / 255, blue: 0.0 / 255, alpha: 0.38)
      public static let floatingCloseBorder: UIColor = UIColor(red: 255.0 / 255, green: 255.0 / 255, blue: 255.0 / 255, alpha: 0.24)
      public static let toastFill: UIColor = UIColor(red: 24.0 / 255, green: 28.0 / 255, blue: 35.0 / 255, alpha: 0.94)
      public static let buttonPrimary: UIColor = themeTokenColor(ThemeTokensStore.shared.tokens.light.buttonPrimary)
      public static let buttonOnPrimary: UIColor = themeTokenColor(ThemeTokensStore.shared.tokens.light.buttonOnPrimary)
      public static let buttonSecondary: UIColor = themeTokenColor(ThemeTokensStore.shared.tokens.light.buttonSecondary)
      public static let buttonOnSecondary: UIColor = themeTokenColor(ThemeTokensStore.shared.tokens.light.buttonOnSecondary)
      public static let buttonDanger: UIColor = themeTokenColor(ThemeTokensStore.shared.tokens.light.buttonDanger)
      public static let buttonOnDanger: UIColor = themeTokenColor(ThemeTokensStore.shared.tokens.light.buttonOnDanger)
    }
    public enum shadow {
      public static let card: String = "0px 6px 24px rgba(31,69,125,0.045)"
      public static let segment: String = "0px 1px 3px rgba(24,39,63,0.12)"
      public static let dialog: String = "0px 16px 48px rgba(16,43,82,0.18)"
    }
  }
  public enum dark {
    public enum color {
      public static let page: UIColor = UIColor(red: 18.0 / 255, green: 19.0 / 255, blue: 22.0 / 255, alpha: 1)
      public static let canvas: UIColor = themeTokenColor(ThemeTokensStore.shared.tokens.dark.canvas)
      public static let surface: UIColor = themeTokenColor(ThemeTokensStore.shared.tokens.dark.surface)
      public static let ink: UIColor = themeTokenColor(ThemeTokensStore.shared.tokens.dark.ink)
      public static let heading: UIColor = UIColor(red: 255.0 / 255, green: 255.0 / 255, blue: 255.0 / 255, alpha: 1)
      public static let title: UIColor = themeTokenColor(ThemeTokensStore.shared.tokens.dark.title)
      public static let subtitle: UIColor = UIColor(red: 213.0 / 255, green: 213.0 / 255, blue: 214.0 / 255, alpha: 1)
      public static let section: UIColor = themeTokenColor(ThemeTokensStore.shared.tokens.dark.section)
      public static let description: UIColor = themeTokenColor(ThemeTokensStore.shared.tokens.dark.description)
      public static let icon: UIColor = themeTokenColor(ThemeTokensStore.shared.tokens.dark.icon)
      public static let chevron: UIColor = themeTokenColor(ThemeTokensStore.shared.tokens.dark.chevron)
      public static let hairline: UIColor = themeTokenColor(ThemeTokensStore.shared.tokens.dark.hairline)
      public static let onInverse: UIColor = UIColor(red: 255.0 / 255, green: 255.0 / 255, blue: 255.0 / 255, alpha: 1)
      public static let iconWell: UIColor = themeTokenColor(ThemeTokensStore.shared.tokens.dark.iconWell)
      public static let pressed: UIColor = themeTokenColor(ThemeTokensStore.shared.tokens.dark.pressed)
      public static let separator: UIColor = themeTokenColor(ThemeTokensStore.shared.tokens.dark.separator)
      public static let cardBorder: UIColor = UIColor(red: 42.0 / 255, green: 43.0 / 255, blue: 50.0 / 255, alpha: 1)
      public static let backPressed: UIColor = themeTokenColor(ThemeTokensStore.shared.tokens.dark.backPressed)
      public static let primary: UIColor = themeTokenColor(ThemeTokensStore.shared.tokens.dark.primary)
      public static let accent: UIColor = UIColor(red: 55.0 / 255, green: 125.0 / 255, blue: 255.0 / 255, alpha: 1)
      public static let success: UIColor = themeTokenColor(ThemeTokensStore.shared.tokens.dark.success)
      public static let text: UIColor = themeTokenColor(ThemeTokensStore.shared.tokens.dark.text)
      public static let muted: UIColor = themeTokenColor(ThemeTokensStore.shared.tokens.dark.muted)
      public static let subtle: UIColor = UIColor(red: 46.0 / 255, green: 47.0 / 255, blue: 54.0 / 255, alpha: 1)
      public static let border: UIColor = themeTokenColor(ThemeTokensStore.shared.tokens.dark.border)
      public static let scrim: UIColor = themeTokenColor(ThemeTokensStore.shared.tokens.dark.scrim)
      public static let danger: UIColor = themeTokenColor(ThemeTokensStore.shared.tokens.dark.danger)
      public static let error: UIColor = UIColor(red: 245.0 / 255, green: 108.0 / 255, blue: 108.0 / 255, alpha: 1)
      public static let cancelFill: UIColor = UIColor(red: 46.0 / 255, green: 47.0 / 255, blue: 54.0 / 255, alpha: 1)
      public static let cancelText: UIColor = UIColor(red: 213.0 / 255, green: 213.0 / 255, blue: 214.0 / 255, alpha: 1)
      public static let cancelBorder: UIColor = UIColor(red: 42.0 / 255, green: 43.0 / 255, blue: 50.0 / 255, alpha: 1)
      public static let confirmFill: UIColor = UIColor(red: 30.0 / 255, green: 98.0 / 255, blue: 208.0 / 255, alpha: 1)
      public static let confirmText: UIColor = UIColor(red: 255.0 / 255, green: 255.0 / 255, blue: 255.0 / 255, alpha: 1)
      public static let confirmBorder: UIColor = UIColor(red: 55.0 / 255, green: 125.0 / 255, blue: 255.0 / 255, alpha: 1)
      public static let selectedFill: UIColor = UIColor(red: 55.0 / 255, green: 125.0 / 255, blue: 255.0 / 255, alpha: 0.18)
      public static let dangerFill: UIColor = UIColor(red: 245.0 / 255, green: 108.0 / 255, blue: 108.0 / 255, alpha: 0.16)
      public static let dangerText: UIColor = UIColor(red: 255.0 / 255, green: 138.0 / 255, blue: 138.0 / 255, alpha: 1)
      public static let dangerBorder: UIColor = UIColor(red: 245.0 / 255, green: 108.0 / 255, blue: 108.0 / 255, alpha: 0.4)
      public static let disabledFill: UIColor = UIColor(red: 42.0 / 255, green: 43.0 / 255, blue: 50.0 / 255, alpha: 1)
      public static let segmentTrack: UIColor = themeTokenColor(ThemeTokensStore.shared.tokens.dark.segmentTrack)
      public static let segmentIndicator: UIColor = themeTokenColor(ThemeTokensStore.shared.tokens.dark.segmentIndicator)
      public static let segmentText: UIColor = themeTokenColor(ThemeTokensStore.shared.tokens.dark.segmentText)
      public static let segmentTextActive: UIColor = themeTokenColor(ThemeTokensStore.shared.tokens.dark.segmentTextActive)
      public static let handle: UIColor = themeTokenColor(ThemeTokensStore.shared.tokens.dark.handle)
      public static let dialogShadow: UIColor = UIColor(red: 0.0 / 255, green: 0.0 / 255, blue: 0.0 / 255, alpha: 0.5)
      public static let segmentShadow: UIColor = UIColor(red: 0.0 / 255, green: 0.0 / 255, blue: 0.0 / 255, alpha: 0.35)
      public static let floatingCloseFill: UIColor = UIColor(red: 0.0 / 255, green: 0.0 / 255, blue: 0.0 / 255, alpha: 0.38)
      public static let floatingCloseBorder: UIColor = UIColor(red: 255.0 / 255, green: 255.0 / 255, blue: 255.0 / 255, alpha: 0.24)
      public static let toastFill: UIColor = UIColor(red: 30.0 / 255, green: 31.0 / 255, blue: 35.0 / 255, alpha: 1)
      public static let buttonPrimary: UIColor = themeTokenColor(ThemeTokensStore.shared.tokens.dark.buttonPrimary)
      public static let buttonOnPrimary: UIColor = themeTokenColor(ThemeTokensStore.shared.tokens.dark.buttonOnPrimary)
      public static let buttonSecondary: UIColor = themeTokenColor(ThemeTokensStore.shared.tokens.dark.buttonSecondary)
      public static let buttonOnSecondary: UIColor = themeTokenColor(ThemeTokensStore.shared.tokens.dark.buttonOnSecondary)
      public static let buttonDanger: UIColor = themeTokenColor(ThemeTokensStore.shared.tokens.dark.buttonDanger)
      public static let buttonOnDanger: UIColor = themeTokenColor(ThemeTokensStore.shared.tokens.dark.buttonOnDanger)
    }
    public enum shadow {
      public static let card: String = "0px 6px 24px rgba(0,0,0,0.35)"
      public static let segment: String = "0px 1px 3px rgba(0,0,0,0.35)"
      public static let dialog: String = "0px 16px 48px rgba(0,0,0,0.5)"
    }
  }
  public enum radius {
    public static let card: CGFloat = CGFloat(ThemeTokensStore.shared.tokens.shared.radius.card)
    public static let sheet: CGFloat = CGFloat(ThemeTokensStore.shared.tokens.shared.radius.sheet)
    public static let icon: CGFloat = CGFloat(ThemeTokensStore.shared.tokens.shared.radius.icon)
    public static let control: CGFloat = CGFloat(ThemeTokensStore.shared.tokens.shared.radius.control)
    public static let surface: CGFloat = CGFloat(ThemeTokensStore.shared.tokens.shared.radius.surface)
    public static let tiny: CGFloat = CGFloat(ThemeTokensStore.shared.tokens.shared.radius.tiny)
    public static let small: CGFloat = CGFloat(ThemeTokensStore.shared.tokens.shared.radius.small)
    public static let medium: CGFloat = CGFloat(ThemeTokensStore.shared.tokens.shared.radius.medium)
    public static let compact: CGFloat = CGFloat(ThemeTokensStore.shared.tokens.shared.radius.compact)
    public static let pill: CGFloat = CGFloat(ThemeTokensStore.shared.tokens.shared.radius.pill)
    public static let button: CGFloat = CGFloat(ThemeTokensStore.shared.tokens.shared.radius.button)
  }
  public enum size {
    public static let nav: CGFloat = CGFloat(ThemeTokensStore.shared.tokens.shared.size.nav)
    public static let navNative: CGFloat = 52
    public static let back: CGFloat = CGFloat(ThemeTokensStore.shared.tokens.shared.size.back)
    public static let icon: CGFloat = CGFloat(ThemeTokensStore.shared.tokens.shared.size.icon)
    public static let row: CGFloat = CGFloat(ThemeTokensStore.shared.tokens.shared.size.row)
    public static let button: CGFloat = CGFloat(ThemeTokensStore.shared.tokens.shared.size.button)
    public static let dialogWidth: CGFloat = 360
    public static let dialogMaxHeight: CGFloat = 600
  }
  public enum buttonSize {
    public enum small {
      public static let height: CGFloat = 32
      public static let fontSize: CGFloat = 13
      public static let lineHeight: CGFloat = 18
      public static let paddingHorizontal: CGFloat = 12
      public static let paddingVertical: CGFloat = 6
      public static let iconSize: CGFloat = 16
    }
    public enum medium {
      public static let height: CGFloat = 40
      public static let fontSize: CGFloat = 14
      public static let lineHeight: CGFloat = 20
      public static let paddingHorizontal: CGFloat = 16
      public static let paddingVertical: CGFloat = 9
      public static let iconSize: CGFloat = 18
    }
    public enum large {
      public static let height: CGFloat = 48
      public static let fontSize: CGFloat = 16
      public static let lineHeight: CGFloat = 22
      public static let paddingHorizontal: CGFloat = 20
      public static let paddingVertical: CGFloat = 12
      public static let iconSize: CGFloat = 20
    }
  }
  public enum space {
    public static let xs: CGFloat = CGFloat(ThemeTokensStore.shared.tokens.shared.space.xs)
    public static let sm: CGFloat = CGFloat(ThemeTokensStore.shared.tokens.shared.space.sm)
    public static let md: CGFloat = CGFloat(ThemeTokensStore.shared.tokens.shared.space.md)
    public static let lg: CGFloat = CGFloat(ThemeTokensStore.shared.tokens.shared.space.lg)
    public static let xl: CGFloat = CGFloat(ThemeTokensStore.shared.tokens.shared.space.xl)
    public static let content: CGFloat = CGFloat(ThemeTokensStore.shared.tokens.shared.space.content)
    public static let section: CGFloat = CGFloat(ThemeTokensStore.shared.tokens.shared.space.section)
    public static let sheetTop: CGFloat = 22
    public static let hairline: CGFloat = 1
    public static let xxs: CGFloat = CGFloat(ThemeTokensStore.shared.tokens.shared.space.xxs)
    public static let inset: CGFloat = 3
    public static let tight: CGFloat = CGFloat(ThemeTokensStore.shared.tokens.shared.space.tight)
    public static let xxl: CGFloat = CGFloat(ThemeTokensStore.shared.tokens.shared.space.xxl)
    public static let wide: CGFloat = CGFloat(ThemeTokensStore.shared.tokens.shared.space.wide)
    public static let bottom: CGFloat = CGFloat(ThemeTokensStore.shared.tokens.shared.space.bottom)
    public static let buttonCompact: CGFloat = 9
    public static let roomy: CGFloat = CGFloat(ThemeTokensStore.shared.tokens.shared.space.roomy)
  }
  public enum font {
    public static let nav: CGFloat = CGFloat(ThemeTokensStore.shared.tokens.shared.font.nav)
    public static let heading: CGFloat = CGFloat(ThemeTokensStore.shared.tokens.shared.font.heading)
    public static let headingLine: CGFloat = 39
    public static let section: CGFloat = CGFloat(ThemeTokensStore.shared.tokens.shared.font.section)
    public static let sectionLine: CGFloat = 19
    public static let title: CGFloat = CGFloat(ThemeTokensStore.shared.tokens.shared.font.title)
    public static let titleLine: CGFloat = 21
    public static let body: CGFloat = CGFloat(ThemeTokensStore.shared.tokens.shared.font.body)
    public static let bodyLine: CGFloat = 17
    public static let button: CGFloat = CGFloat(ThemeTokensStore.shared.tokens.shared.font.button)
    public static let buttonLine: CGFloat = 22
    public static let sheetTitle: CGFloat = CGFloat(ThemeTokensStore.shared.tokens.shared.font.sheetTitle)
    public static let segment: CGFloat = CGFloat(ThemeTokensStore.shared.tokens.shared.font.segment)
    public static let segmentLine: CGFloat = 20
    public static let tiny: CGFloat = CGFloat(ThemeTokensStore.shared.tokens.shared.font.tiny)
    public static let content: CGFloat = 14
    public static let control: CGFloat = 16
    public static let subtitle: CGFloat = 17
    public static let subheading: CGFloat = 18
    public static let subtitleLine: CGFloat = 24
    public static let valueLine: CGFloat = 22
    public static let captionLine: CGFloat = 18
    public static let contentLine: CGFloat = 20
    public static let large: CGFloat = 22
    public static let largeLine: CGFloat = 28
    public static let display: CGFloat = 32
    public static let hero: CGFloat = 42
    public static let iconSmall: CGFloat = 21
    public static let iconMedium: CGFloat = 27
    public static let iconLarge: CGFloat = 28
    public static let iconDisplay: CGFloat = 29
  }
  public enum icon {
    public static let row: CGFloat = CGFloat(ThemeTokensStore.shared.tokens.shared.icon.row)
    public static let chevron: CGFloat = CGFloat(ThemeTokensStore.shared.tokens.shared.icon.chevron)
    public static let back: CGFloat = CGFloat(ThemeTokensStore.shared.tokens.shared.icon.back)
  }
  public enum motion {
    public static let pressedOpacity: CGFloat = CGFloat(ThemeTokensStore.shared.tokens.shared.motion.pressedOpacity)
    public static let confirmOpacity: CGFloat = 0.9
    public static let pressedScale: CGFloat = CGFloat(ThemeTokensStore.shared.tokens.shared.motion.pressedScale)
    public static let disabledOpacity: CGFloat = CGFloat(ThemeTokensStore.shared.tokens.shared.motion.disabledOpacity)
  }
  public enum component {
    public enum card {
      public static let radius: CGFloat = 20
      public static let padding: CGFloat = 20
      public static let gap: CGFloat = 16
      public static let titleSize: CGFloat = 16
      public static let titleLine: CGFloat = 22
      public static let descriptionSize: CGFloat = 13
      public static let descriptionLine: CGFloat = 20
    }
    public enum page {
      public static let padding: CGFloat = 20
      public static let gap: CGFloat = 16
      public static let titleSize: CGFloat = 25
      public static let titleLine: CGFloat = 34
    }
    public enum input {
      public static let height: CGFloat = 54
      public static let radius: CGFloat = 12
      public static let padding: CGFloat = 16
      public static let fontSize: CGFloat = 16
      public static let lineHeight: CGFloat = 22
      public static let labelSize: CGFloat = 14
      public static let labelLine: CGFloat = 20
      public static let helpSize: CGFloat = 12
      public static let helpLine: CGFloat = 18
      public static let gap: CGFloat = 8
    }
    public enum search {
      public static let height: CGFloat = 44
      public static let radius: CGFloat = 12
      public static let fontSize: CGFloat = 15
      public static let lineHeight: CGFloat = 22
      public static let padding: CGFloat = 12
      public static let icon: CGFloat = 20
    }
    public enum switchControl {
      public static let width: CGFloat = 52
      public static let height: CGFloat = 32
    }
    public enum selection {
      public static let height: CGFloat = 48
      public static let icon: CGFloat = 22
      public static let gap: CGFloat = 12
      public static let titleSize: CGFloat = 15
      public static let titleLine: CGFloat = 22
      public static let descriptionSize: CGFloat = 12
      public static let descriptionLine: CGFloat = 18
    }
    public enum cell {
      public static let height: CGFloat = 64
      public static let descriptionHeight: CGFloat = 82
      public static let padding: CGFloat = 16
      public static let gap: CGFloat = 12
      public static let titleSize: CGFloat = 15
      public static let titleLine: CGFloat = 22
    }
    public enum segment {
      public static let height: CGFloat = 44
      public static let track: CGFloat = 36
      public static let indicator: CGFloat = 30
      public static let padding: CGFloat = 3
      public static let trackRadius: CGFloat = 10
      public static let indicatorRadius: CGFloat = 7
      public static let indicatorInset: CGFloat = 7
      public static let trackInset: CGFloat = 4
    }
    public enum overlay {
      public static let radius: CGFloat = 20
      public static let padding: CGFloat = 24
      public static let gap: CGFloat = 16
      public static let handleWidth: CGFloat = 36
      public static let handleHeight: CGFloat = 4
      public static let handleTop: CGFloat = 10
      public static let titleGap: CGFloat = 18
      public static let closeSize: CGFloat = 44
      public static let closeInset: CGFloat = 16
      public static let closeIcon: CGFloat = 20
      public static let closeStroke: CGFloat = 2
      public static let titleSize: CGFloat = 18
      public static let titleLine: CGFloat = 26
      public static let descriptionSize: CGFloat = 15
      public static let descriptionLine: CGFloat = 22
    }
    public enum state {
      public static let titleSize: CGFloat = 18
      public static let titleLine: CGFloat = 24
      public static let descriptionSize: CGFloat = 14
      public static let descriptionLine: CGFloat = 22
      public static let buttonWidth: CGFloat = 96
      public enum button {
        public static let height: CGFloat = 44
        public static let fontSize: CGFloat = 14
        public static let lineHeight: CGFloat = 20
        public static let paddingHorizontal: CGFloat = 18
        public static let paddingVertical: CGFloat = 12
        public static let iconSize: CGFloat = 18
      }
      public static let imageWidth: CGFloat = 144
      public static let imageHeight: CGFloat = 120
      public static let illustrationGap: CGFloat = 14
      public static let labelGap: CGFloat = 6
      public static let actionGap: CGFloat = 20
      public static let descriptionWidth: CGFloat = 280
      public static let contentInset: CGFloat = 24
    }
    public enum thumbnail {
      public static let size: CGFloat = 92
      public static let radius: CGFloat = 12
      public static let gap: CGFloat = 10
    }
    public enum motion {
      public static let cardRadius: CGFloat = 20
      public static let cardPadding: CGFloat = 20
      public static let cardGap: CGFloat = 16
    }
    public enum toast {
      public static let radius: CGFloat = 12
      public static let paddingX: CGFloat = 18
      public static let paddingY: CGFloat = 12
      public static let fontSize: CGFloat = 15
      public static let lineHeight: CGFloat = 22
      public static let minHeight: CGFloat = 48
      public static let maxWidth: CGFloat = 320
      public static let margin: CGFloat = 48
    }
    public enum mediaSheet {
      public static let maxHeight: CGFloat = 620
      public static let heightRatio: CGFloat = 0.68
      public static let actionWidth: CGFloat = 280
      public static let scrimHeight: CGFloat = 160
      public static let scrimOpacity: CGFloat = 0.72
    }
  }
  public enum media {
    public static let canvas: UIColor = UIColor(red: 0.0 / 255, green: 0.0 / 255, blue: 0.0 / 255, alpha: 1)
    public static let text: UIColor = UIColor(red: 255.0 / 255, green: 255.0 / 255, blue: 255.0 / 255, alpha: 1)
    public static let chrome: UIColor = UIColor(red: 38.0 / 255, green: 38.0 / 255, blue: 38.0 / 255, alpha: 0.75)
    public static let retry: UIColor = UIColor(red: 58.0 / 255, green: 58.0 / 255, blue: 58.0 / 255, alpha: 1)
    public static let scannerCanvas: UIColor = UIColor(red: 17.0 / 255, green: 19.0 / 255, blue: 24.0 / 255, alpha: 1)
    public static let torchOff: UIColor = UIColor(red: 44.0 / 255, green: 47.0 / 255, blue: 54.0 / 255, alpha: 1)
  }
}

private func themeTokenColor(_ value: String) -> UIColor {
    if value.hasPrefix("#") {
        precondition(value.count == 7)
        let rgb = UInt32(value.dropFirst(), radix: 16)!
        return UIColor(red: CGFloat((rgb >> 16) & 255) / 255,
                       green: CGFloat((rgb >> 8) & 255) / 255,
                       blue: CGFloat(rgb & 255) / 255, alpha: 1)
    }
    precondition(value.hasPrefix("rgba(") && value.hasSuffix(")"))
    let parts = value.dropFirst(5).dropLast().split(separator: ",").map { Double($0.trimmingCharacters(in: .whitespaces))! }
    precondition(parts.count == 4)
    return UIColor(red: CGFloat(parts[0]) / 255, green: CGFloat(parts[1]) / 255,
                   blue: CGFloat(parts[2]) / 255, alpha: CGFloat(parts[3]))
}
