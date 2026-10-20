"use strict";
var SfMotion;
(function (SfMotion) {
    function staggerDelay(index) { return index < 5 ? Math.min(index * SfMotion.config.stagger, SfMotion.config.maxDelay) : 0; }
    SfMotion.staggerDelay = staggerDelay;
})(SfMotion || (SfMotion = {}));
