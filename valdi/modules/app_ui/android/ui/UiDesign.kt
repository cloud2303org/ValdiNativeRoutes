// Shared design fields read the native ThemeTokensStore; component-only constants remain here.
package io.valdiroutes.app_ui.ui

import androidx.compose.ui.graphics.Color
import io.valdiroutes.app.modules.theme_bridge.ThemeTokensStore
import kotlin.math.roundToInt

object UiDesign {
  object palette {
    val blueLight = Color(0xff377dff)
    val bluePrimary = Color(0xff1e62d0)
    val blueDark = Color(0xff1549a8)
    val greenLight = Color(0xff56dcba)
    val greenPrimary = Color(0xff0ecd9d)
    val greenDark = Color(0xff0a906e)
    val redLight = Color(0xfff56c6c)
    val redPrimary = Color(0xffd54941)
    val redDark = Color(0xffb8251f)
    val grayLight = Color(0xfff1f3f5)
    val gray = Color(0xffd5d5d6)
    val grayDark = Color(0xff969696)
    val white = Color(0xffffffff)
    val black = Color(0xff000000)
  }
  object light {
    object color {
      val page = Color(0xffeaf1fb)
      val canvas = themeTokenColor(ThemeTokensStore.tokens.light.canvas)
      val surface = themeTokenColor(ThemeTokensStore.tokens.light.surface)
      val ink = themeTokenColor(ThemeTokensStore.tokens.light.ink)
      val heading = Color(0xff203d65)
      val title = themeTokenColor(ThemeTokensStore.tokens.light.title)
      val subtitle = Color(0xff728bac)
      val section = themeTokenColor(ThemeTokensStore.tokens.light.section)
      val description = themeTokenColor(ThemeTokensStore.tokens.light.description)
      val icon = themeTokenColor(ThemeTokensStore.tokens.light.icon)
      val chevron = themeTokenColor(ThemeTokensStore.tokens.light.chevron)
      val hairline = themeTokenColor(ThemeTokensStore.tokens.light.hairline)
      val onInverse = Color(0xffffffff)
      val iconWell = themeTokenColor(ThemeTokensStore.tokens.light.iconWell)
      val pressed = themeTokenColor(ThemeTokensStore.tokens.light.pressed)
      val separator = themeTokenColor(ThemeTokensStore.tokens.light.separator)
      val cardBorder = Color(0xc7ffffff)
      val backPressed = themeTokenColor(ThemeTokensStore.tokens.light.backPressed)
      val primary = themeTokenColor(ThemeTokensStore.tokens.light.primary)
      val accent = Color(0xff377dff)
      val success = themeTokenColor(ThemeTokensStore.tokens.light.success)
      val text = themeTokenColor(ThemeTokensStore.tokens.light.text)
      val muted = themeTokenColor(ThemeTokensStore.tokens.light.muted)
      val subtle = Color(0xfff4f6f8)
      val border = themeTokenColor(ThemeTokensStore.tokens.light.border)
      val scrim = themeTokenColor(ThemeTokensStore.tokens.light.scrim)
      val danger = themeTokenColor(ThemeTokensStore.tokens.light.danger)
      val error = Color(0xffd54941)
      val cancelFill = Color(0xfff2f4f7)
      val cancelText = Color(0xff43556f)
      val cancelBorder = Color(0xffe4e7ec)
      val confirmFill = Color(0xffd4e6fb)
      val confirmText = Color(0xff164f9e)
      val confirmBorder = Color(0xffcbdff8)
      val selectedFill = Color(0xffd4e6fb)
      val dangerFill = Color(0xfffce5e8)
      val dangerText = Color(0xffac293c)
      val dangerBorder = Color(0xfff3cdd2)
      val disabledFill = Color(0xffedf1f7)
      val segmentTrack = themeTokenColor(ThemeTokensStore.tokens.light.segmentTrack)
      val segmentIndicator = themeTokenColor(ThemeTokensStore.tokens.light.segmentIndicator)
      val segmentText = themeTokenColor(ThemeTokensStore.tokens.light.segmentText)
      val segmentTextActive = themeTokenColor(ThemeTokensStore.tokens.light.segmentTextActive)
      val handle = themeTokenColor(ThemeTokensStore.tokens.light.handle)
      val dialogShadow = Color(0x2e102b52)
      val segmentShadow = Color(0x1f18273f)
      val floatingCloseFill = Color(0x61000000)
      val floatingCloseBorder = Color(0x3dffffff)
      val toastFill = Color(0xf0181c23)
      val buttonPrimary = themeTokenColor(ThemeTokensStore.tokens.light.buttonPrimary)
      val buttonOnPrimary = themeTokenColor(ThemeTokensStore.tokens.light.buttonOnPrimary)
      val buttonSecondary = themeTokenColor(ThemeTokensStore.tokens.light.buttonSecondary)
      val buttonOnSecondary = themeTokenColor(ThemeTokensStore.tokens.light.buttonOnSecondary)
      val buttonDanger = themeTokenColor(ThemeTokensStore.tokens.light.buttonDanger)
      val buttonOnDanger = themeTokenColor(ThemeTokensStore.tokens.light.buttonOnDanger)
    }
    object shadow {
      val card = "0px 6px 24px rgba(31,69,125,0.045)"
      val segment = "0px 1px 3px rgba(24,39,63,0.12)"
      val dialog = "0px 16px 48px rgba(16,43,82,0.18)"
    }
  }
  object dark {
    object color {
      val page = Color(0xff121316)
      val canvas = themeTokenColor(ThemeTokensStore.tokens.dark.canvas)
      val surface = themeTokenColor(ThemeTokensStore.tokens.dark.surface)
      val ink = themeTokenColor(ThemeTokensStore.tokens.dark.ink)
      val heading = Color(0xffffffff)
      val title = themeTokenColor(ThemeTokensStore.tokens.dark.title)
      val subtitle = Color(0xffd5d5d6)
      val section = themeTokenColor(ThemeTokensStore.tokens.dark.section)
      val description = themeTokenColor(ThemeTokensStore.tokens.dark.description)
      val icon = themeTokenColor(ThemeTokensStore.tokens.dark.icon)
      val chevron = themeTokenColor(ThemeTokensStore.tokens.dark.chevron)
      val hairline = themeTokenColor(ThemeTokensStore.tokens.dark.hairline)
      val onInverse = Color(0xffffffff)
      val iconWell = themeTokenColor(ThemeTokensStore.tokens.dark.iconWell)
      val pressed = themeTokenColor(ThemeTokensStore.tokens.dark.pressed)
      val separator = themeTokenColor(ThemeTokensStore.tokens.dark.separator)
      val cardBorder = Color(0xff2a2b32)
      val backPressed = themeTokenColor(ThemeTokensStore.tokens.dark.backPressed)
      val primary = themeTokenColor(ThemeTokensStore.tokens.dark.primary)
      val accent = Color(0xff377dff)
      val success = themeTokenColor(ThemeTokensStore.tokens.dark.success)
      val text = themeTokenColor(ThemeTokensStore.tokens.dark.text)
      val muted = themeTokenColor(ThemeTokensStore.tokens.dark.muted)
      val subtle = Color(0xff2e2f36)
      val border = themeTokenColor(ThemeTokensStore.tokens.dark.border)
      val scrim = themeTokenColor(ThemeTokensStore.tokens.dark.scrim)
      val danger = themeTokenColor(ThemeTokensStore.tokens.dark.danger)
      val error = Color(0xfff56c6c)
      val cancelFill = Color(0xff2e2f36)
      val cancelText = Color(0xffd5d5d6)
      val cancelBorder = Color(0xff2a2b32)
      val confirmFill = Color(0xff1e62d0)
      val confirmText = Color(0xffffffff)
      val confirmBorder = Color(0xff377dff)
      val selectedFill = Color(0x2e377dff)
      val dangerFill = Color(0x29f56c6c)
      val dangerText = Color(0xffff8a8a)
      val dangerBorder = Color(0x66f56c6c)
      val disabledFill = Color(0xff2a2b32)
      val segmentTrack = themeTokenColor(ThemeTokensStore.tokens.dark.segmentTrack)
      val segmentIndicator = themeTokenColor(ThemeTokensStore.tokens.dark.segmentIndicator)
      val segmentText = themeTokenColor(ThemeTokensStore.tokens.dark.segmentText)
      val segmentTextActive = themeTokenColor(ThemeTokensStore.tokens.dark.segmentTextActive)
      val handle = themeTokenColor(ThemeTokensStore.tokens.dark.handle)
      val dialogShadow = Color(0x80000000)
      val segmentShadow = Color(0x59000000)
      val floatingCloseFill = Color(0x61000000)
      val floatingCloseBorder = Color(0x3dffffff)
      val toastFill = Color(0xff1e1f23)
      val buttonPrimary = themeTokenColor(ThemeTokensStore.tokens.dark.buttonPrimary)
      val buttonOnPrimary = themeTokenColor(ThemeTokensStore.tokens.dark.buttonOnPrimary)
      val buttonSecondary = themeTokenColor(ThemeTokensStore.tokens.dark.buttonSecondary)
      val buttonOnSecondary = themeTokenColor(ThemeTokensStore.tokens.dark.buttonOnSecondary)
      val buttonDanger = themeTokenColor(ThemeTokensStore.tokens.dark.buttonDanger)
      val buttonOnDanger = themeTokenColor(ThemeTokensStore.tokens.dark.buttonOnDanger)
    }
    object shadow {
      val card = "0px 6px 24px rgba(0,0,0,0.35)"
      val segment = "0px 1px 3px rgba(0,0,0,0.35)"
      val dialog = "0px 16px 48px rgba(0,0,0,0.5)"
    }
  }
  object radius {
    val card = ThemeTokensStore.tokens.shared.radius.card.toFloat()
    val sheet = ThemeTokensStore.tokens.shared.radius.sheet.toFloat()
    val icon = ThemeTokensStore.tokens.shared.radius.icon.toFloat()
    val control = ThemeTokensStore.tokens.shared.radius.control.toFloat()
    val surface = ThemeTokensStore.tokens.shared.radius.surface.toFloat()
    val tiny = ThemeTokensStore.tokens.shared.radius.tiny.toFloat()
    val small = ThemeTokensStore.tokens.shared.radius.small.toFloat()
    val medium = ThemeTokensStore.tokens.shared.radius.medium.toFloat()
    val compact = ThemeTokensStore.tokens.shared.radius.compact.toFloat()
    val pill = ThemeTokensStore.tokens.shared.radius.pill.toFloat()
    val button = ThemeTokensStore.tokens.shared.radius.button.toFloat()
  }
  object size {
    val nav = ThemeTokensStore.tokens.shared.size.nav.toFloat()
    val navNative = 52f
    val back = ThemeTokensStore.tokens.shared.size.back.toFloat()
    val icon = ThemeTokensStore.tokens.shared.size.icon.toFloat()
    val row = ThemeTokensStore.tokens.shared.size.row.toFloat()
    val button = ThemeTokensStore.tokens.shared.size.button.toFloat()
    val dialogWidth = 360f
    val dialogMaxHeight = 600f
  }
  object buttonSize {
    object small {
      val height = 32f
      val fontSize = 13f
      val lineHeight = 18f
      val paddingHorizontal = 12f
      val paddingVertical = 6f
      val iconSize = 16f
    }
    object medium {
      val height = 40f
      val fontSize = 14f
      val lineHeight = 20f
      val paddingHorizontal = 16f
      val paddingVertical = 9f
      val iconSize = 18f
    }
    object large {
      val height = 48f
      val fontSize = 16f
      val lineHeight = 22f
      val paddingHorizontal = 20f
      val paddingVertical = 12f
      val iconSize = 20f
    }
  }
  object space {
    val xs = ThemeTokensStore.tokens.shared.space.xs.toFloat()
    val sm = ThemeTokensStore.tokens.shared.space.sm.toFloat()
    val md = ThemeTokensStore.tokens.shared.space.md.toFloat()
    val lg = ThemeTokensStore.tokens.shared.space.lg.toFloat()
    val xl = ThemeTokensStore.tokens.shared.space.xl.toFloat()
    val content = ThemeTokensStore.tokens.shared.space.content.toFloat()
    val section = ThemeTokensStore.tokens.shared.space.section.toFloat()
    val sheetTop = 22f
    val hairline = 1f
    val xxs = ThemeTokensStore.tokens.shared.space.xxs.toFloat()
    val inset = 3f
    val tight = ThemeTokensStore.tokens.shared.space.tight.toFloat()
    val xxl = ThemeTokensStore.tokens.shared.space.xxl.toFloat()
    val wide = ThemeTokensStore.tokens.shared.space.wide.toFloat()
    val bottom = ThemeTokensStore.tokens.shared.space.bottom.toFloat()
    val buttonCompact = 9f
    val roomy = ThemeTokensStore.tokens.shared.space.roomy.toFloat()
  }
  object font {
    val nav = ThemeTokensStore.tokens.shared.font.nav.toFloat()
    val heading = ThemeTokensStore.tokens.shared.font.heading.toFloat()
    val headingLine = 39f
    val section = ThemeTokensStore.tokens.shared.font.section.toFloat()
    val sectionLine = 19f
    val title = ThemeTokensStore.tokens.shared.font.title.toFloat()
    val titleLine = 21f
    val body = ThemeTokensStore.tokens.shared.font.body.toFloat()
    val bodyLine = 17f
    val button = ThemeTokensStore.tokens.shared.font.button.toFloat()
    val buttonLine = 22f
    val sheetTitle = ThemeTokensStore.tokens.shared.font.sheetTitle.toFloat()
    val segment = ThemeTokensStore.tokens.shared.font.segment.toFloat()
    val segmentLine = 20f
    val tiny = ThemeTokensStore.tokens.shared.font.tiny.toFloat()
    val content = 14f
    val control = 16f
    val subtitle = 17f
    val subheading = 18f
    val subtitleLine = 24f
    val valueLine = 22f
    val captionLine = 18f
    val contentLine = 20f
    val large = 22f
    val largeLine = 28f
    val display = 32f
    val hero = 42f
    val iconSmall = 21f
    val iconMedium = 27f
    val iconLarge = 28f
    val iconDisplay = 29f
  }
  object icon {
    val row = ThemeTokensStore.tokens.shared.icon.row.toFloat()
    val chevron = ThemeTokensStore.tokens.shared.icon.chevron.toFloat()
    val back = ThemeTokensStore.tokens.shared.icon.back.toFloat()
  }
  object motion {
    val pressedOpacity = ThemeTokensStore.tokens.shared.motion.pressedOpacity.toFloat()
    val confirmOpacity = 0.9f
    val pressedScale = ThemeTokensStore.tokens.shared.motion.pressedScale.toFloat()
    val disabledOpacity = ThemeTokensStore.tokens.shared.motion.disabledOpacity.toFloat()
  }
  object component {
    object card {
      val radius = 20f
      val padding = 20f
      val gap = 16f
      val titleSize = 16f
      val titleLine = 22f
      val descriptionSize = 13f
      val descriptionLine = 20f
    }
    object page {
      val padding = 20f
      val gap = 16f
      val titleSize = 25f
      val titleLine = 34f
    }
    object input {
      val height = 54f
      val radius = 12f
      val padding = 16f
      val fontSize = 16f
      val lineHeight = 22f
      val labelSize = 14f
      val labelLine = 20f
      val helpSize = 12f
      val helpLine = 18f
      val gap = 8f
    }
    object search {
      val height = 44f
      val radius = 12f
      val fontSize = 15f
      val lineHeight = 22f
      val padding = 12f
      val icon = 20f
    }
    object switchControl {
      val width = 52f
      val height = 32f
    }
    object selection {
      val height = 48f
      val icon = 22f
      val gap = 12f
      val titleSize = 15f
      val titleLine = 22f
      val descriptionSize = 12f
      val descriptionLine = 18f
    }
    object cell {
      val height = 64f
      val descriptionHeight = 82f
      val padding = 16f
      val gap = 12f
      val titleSize = 15f
      val titleLine = 22f
    }
    object segment {
      val height = 44f
      val track = 36f
      val indicator = 30f
      val padding = 3f
      val trackRadius = 10f
      val indicatorRadius = 7f
      val indicatorInset = 7f
      val trackInset = 4f
    }
    object overlay {
      val radius = 20f
      val padding = 24f
      val gap = 16f
      val handleWidth = 36f
      val handleHeight = 4f
      val handleTop = 10f
      val titleGap = 18f
      val closeSize = 44f
      val closeInset = 16f
      val closeIcon = 20f
      val closeStroke = 2f
      val titleSize = 18f
      val titleLine = 26f
      val descriptionSize = 15f
      val descriptionLine = 22f
    }
    object state {
      val titleSize = 18f
      val titleLine = 24f
      val descriptionSize = 14f
      val descriptionLine = 22f
      val buttonWidth = 96f
      object button {
        val height = 44f
        val fontSize = 14f
        val lineHeight = 20f
        val paddingHorizontal = 18f
        val paddingVertical = 12f
        val iconSize = 18f
      }
      val imageWidth = 144f
      val imageHeight = 120f
      val illustrationGap = 14f
      val labelGap = 6f
      val actionGap = 20f
      val descriptionWidth = 280f
      val contentInset = 24f
    }
    object thumbnail {
      val size = 92f
      val radius = 12f
      val gap = 10f
    }
    object motion {
      val cardRadius = 20f
      val cardPadding = 20f
      val cardGap = 16f
    }
    object toast {
      val radius = 12f
      val paddingX = 18f
      val paddingY = 12f
      val fontSize = 15f
      val lineHeight = 22f
      val minHeight = 48f
      val maxWidth = 320f
      val margin = 48f
    }
    object mediaSheet {
      val maxHeight = 620f
      val heightRatio = 0.68f
      val actionWidth = 280f
      val scrimHeight = 160f
      val scrimOpacity = 0.72f
    }
  }
  object media {
    val canvas = Color(0xff000000)
    val text = Color(0xffffffff)
    val chrome = Color(0xbf262626)
    val retry = Color(0xff3a3a3a)
    val scannerCanvas = Color(0xff111318)
    val torchOff = Color(0xff2c2f36)
  }
}

private fun themeTokenColor(value: String): Color {
    if (value.startsWith("#")) return Color(android.graphics.Color.parseColor(value))
    require(value.startsWith("rgba(") && value.endsWith(")"))
    val parts = value.substring(5, value.length - 1).split(",").map { it.trim().toDouble() }
    require(parts.size == 4)
    return Color(parts[0].toInt(), parts[1].toInt(), parts[2].toInt(), (parts[3] * 255).roundToInt())
}
