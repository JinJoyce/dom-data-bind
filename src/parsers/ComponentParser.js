/**
 * @file 组件解析器
 * @author yibuyisheng(yibuyisheng@163.com)
 */

var inherit = require('../inherit');
var Parser = require('./Parser');
var Tree = require('../trees/Tree');
var ComponentManager = require('../ComponentManager');
var utils = require('../utils');

function ComponentParser(options) {
    Parser.call(this, options);
}

ComponentParser.prototype.initialize = function (options) {
    Parser.prototype.initialize.apply(this, arguments);

    this.componentManager = this.tree.componentManager;

    this.node = options.node;

    this.exprs = [];
    this.exprFns = {};
    this.updateFns = {};
    this.exprOldValues = {};
};

ComponentParser.prototype.collectExprs = function () {
    var curNode = this.node;

    var attributes = curNode.attributes;
    // 搜集不含有表达式的属性，然后在组件类创建好之后设置进组件
    this.setLiteralAttrsFns = [];
    for (var i = 0, il = attributes.length; i < il; i++) {
        var attr = attributes[i];
        var expr = attr.nodeValue;
        if (this.config.getExprRegExp().test(expr)) {
            this.exprs.push(expr);
            if (!this.exprFns[expr]) {
                var rawExpr = getRawExpr(expr, this.config);
                this.exprCalculater.createExprFn(rawExpr);
                this.exprFns[expr] = utils.bind(calculateExpr, null, rawExpr, this.exprCalculater);

                this.updateFns[expr] = this.updateFns[expr] || [];
                this.updateFns[expr].push(utils.bind(updateAttr, null, attr.nodeName));
            }
        }
        else {
            this.setLiteralAttrsFns.push(utils.bind(literalAttrFn, null, attr));
        }
    }

    var componentName = this.node.tagName.toLowerCase()
        .replace('ui', '')
        .replace(/-[a-z]/g, function () {
            return arguments[0][1].toUpperCase();
        });

    var ComponentClass = this.componentManager.getClass(componentName);
    if (!ComponentClass) {
        throw new Error('the component `' + componentName + '` is not registed!');
    }

    this.component = new ComponentClass({
        componentNode: this.node,
        tree: this.tree
    });

    return true;

    function literalAttrFn(attr, component) {
        component.setAttr(attr.nodeName, attr.nodeValue);
    }

    function updateAttr(name, exprValue, component) {
        component.setAttr(name, exprValue);
    }

    function calculateExpr(rawExpr, exprCalculater, scopeModel) {
        return exprCalculater.calculate(rawExpr, false, scopeModel);
    }

    function getRawExpr(expr, config) {
        return expr.replace(config.getExprRegExp(), function () {
            return arguments[1];
        });
    }
};

ComponentParser.prototype.setScope = function (scopeModel) {
    Parser.prototype.setScope.apply(this, arguments);

    this.component.setOutScope(this.scopeModel);

    var me = this;
    this.component.getTpl(function () {
        me.component.mount();

        for (var i = 0, il = me.setLiteralAttrsFns.length; i < il; i++) {
            me.setLiteralAttrsFns[i](me.component);
        }

        me.component.literalAttrReady();
    });
};

ComponentParser.prototype.onChange = function () {
    if (this.isGoDark) {
        return;
    }

    var exprs = this.exprs;
    var exprOldValues = this.exprOldValues;
    for (var i = 0, il = exprs.length; i < il; i++) {
        var expr = exprs[i];
        var exprValue = this.exprFns[expr](this.scopeModel);

        if (this.dirtyCheck(expr, exprValue, exprOldValues[expr])) {
            var updateFns = this.updateFns[expr];
            for (var j = 0, jl = updateFns.length; j < jl; j++) {
                updateFns[j](exprValue, this.component);
            }
        }

        exprOldValues[expr] = exprValue;
    }

    Parser.prototype.onChange.apply(this, arguments);
};

ComponentParser.prototype.goDark = function () {
    this.component.goDark();
    this.isGoDark = true;
};

ComponentParser.prototype.restoreFromDark = function () {
    this.component.restoreFromDark();
    this.isGoDark = false;
};

ComponentParser.isProperNode = function (node, config) {
    return node.nodeType === 1 && node.tagName.toLowerCase().indexOf('ui-') === 0;
};

module.exports = inherit(ComponentParser, Parser);
Tree.registeParser(ComponentParser);

function getClass(instance) {
    return instance.constructor;
}
