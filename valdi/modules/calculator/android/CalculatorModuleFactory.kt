// Adapted from Valdi's polyglot_bridge_module template (MIT).
package com.snap.modules.calculator

import com.snap.valdi.modules.RegisterValdiModule

@RegisterValdiModule
class CalculatorModuleFactoryImpl : CalculatorModuleFactory() {
    override fun onLoadModule(): CalculatorModule = object : CalculatorModule {
        override fun multiply(left: Double, right: Double): Double = left * right
    }
}
