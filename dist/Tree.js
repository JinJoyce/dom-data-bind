(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/**
 * @file 表达式解析器，一个文本节点或者元素节点对应一个表达式解析器实例
 * @author yibuyisheng(yibuyisheng@163.com)
 */

var Parser = require('./Parser');
var inherit = require('./inherit');
var utils = require('./utils');

function ExprParser(options) {
    Parser.call(this, options);
}

ExprParser.prototype.initialize = function (options) {
    this.node = options.node;
    this.config = options.config;

    this.exprs = [];
    this.exprFns = {};
    this.updateFns = {};
    this.exprOldValues = {};
};

ExprParser.prototype.collectExprs = function () {
    var curNode = this.node;

    // 文本节点
    if (curNode.nodeType === 3) {
        addExpr(this, curNode.nodeValue, (function (curNode) {
            return function (exprValue) {
                curNode.nodeValue = exprValue;
            };
        })(curNode));
    }
    // 元素节点
    else if (curNode.nodeType === 1) {
        var attributes = curNode.attributes;
        for (var i = 0, il = attributes.length; i < il; i++) {
            var attr = attributes[i];
            addExpr(this, attr.value, createAttrUpdateFn(attr));
        }
    }

    function createAttrUpdateFn(attr) {
        return function (exprValue) {
            attr.value = exprValue;
        };
    }
};

ExprParser.prototype.setData = function (data) {
    var exprs = this.exprs;
    var exprOldValues = this.exprOldValues;
    for (var i = 0, il = exprs.length; i < il; i++) {
        var expr = exprs[i];
        var exprValue = this.exprFns[expr](data);

        if (this.dirtyCheck(expr, exprValue, exprOldValues[expr])) {
            var updateFns = this.updateFns[expr];
            for (var j = 0, jl = updateFns.length; j < jl; j++) {
                updateFns[j](exprValue);
            }
        }

        exprOldValues[expr] = exprValue;
    }
};

ExprParser.prototype.goDark = function () {
    utils.goDark(this.node);
};

ExprParser.prototype.restoreFromDark = function () {
    utils.restoreFromDark(this.node);
};


module.exports = inherit(ExprParser, Parser);

function addExpr(parser, expr, updateFn) {
    parser.exprs.push(expr);
    if (!parser.exprFns[expr]) {
        parser.exprFns[expr] = createExprFn(parser.config.getExprRegExp(), expr);
    }
    parser.updateFns[expr] = parser.updateFns[expr] || [];
    parser.updateFns[expr].push(updateFn);
}

function createExprFn(exprRegExp, expr) {
    return function (data) {
        return expr.replace(exprRegExp, function () {
            return utils.calculateExpression(arguments[1], data);
        });
    };
}

},{"./Parser":4,"./inherit":6,"./utils":7}],2:[function(require,module,exports){
/**
 * @file for 指令
 * @author yibuyisheng(yibuyisheng@163.com)
 */

var inherit = require('./inherit');
var Parser = require('./Parser');
var utils = require('./utils');

function ForDirectiveParser(options) {
    Parser.call(this, options);
}

ForDirectiveParser.prototype.initialize = function (options) {
    this.startNode = options.startNode;
    this.endNode = options.endNode;
    this.config = options.config;
    this.Tree = options.Tree;
};

ForDirectiveParser.prototype.collectExprs = function () {
    if (this.startNode.nextSibling === this.endNode) {
        return;
    }

    var tplSeg = document.createElement('div');
    utils.traverseNodes(this.startNode, this.endNode, function (curNode) {
        if (curNode === this.startNode || curNode === this.endNode) {
            return;
        }

        tplSeg.appendChild(curNode);
    }, this);
    this.tplSeg = tplSeg;

    this.expr = this.startNode.nodeValue.match(this.config.getForExprsRegExp())[1];
    this.exprFn = utils.createExprFn(this.config.getExprRegExp(), this.expr);
    this.updateFn = createUpdateFn(
        this,
        this.Tree,
        this.startNode.nextSibling,
        this.endNode.previousSibling,
        this.config,
        this.startNode.nodeValue
    );
};

ForDirectiveParser.prototype.setData = function (data) {
    if (!this.expr) {
        return;
    }

    var exprValue = this.exprFn(data);
    if (this.dirtyCheck(this.expr, exprValue, this.exprOldValue)) {
        this.updateFn(exprValue, data);
    }

    this.exprOldValue = exprValue;
};

ForDirectiveParser.isForNode = function (node, config) {
    return node.nodeType === 8 && config.forPrefixRegExp.test(node.nodeValue);
};

ForDirectiveParser.isForEndNode = function (node, config) {
    return node.nodeType === 8 && config.forEndPrefixRegExp.test(node.nodeValue);
};

ForDirectiveParser.findForEnd = function (forStartNode, config) {
    var curNode = forStartNode;
    while ((curNode = curNode.nextSibling)) {
        if (ForDirectiveParser.isForEndNode(curNode, config)) {
            return curNode;
        }
    }
};

module.exports = inherit(ForDirectiveParser, Parser);

function createUpdateFn(parser, Tree, startNode, endNode, config, fullExpr) {
    var trees = [];
    var itemVariableName = fullExpr.match(parser.config.getForItemValueNameRegExp())[1];
    return function (exprValue, data) {
        var index = 0;
        for (var k in exprValue) {
            if (!trees[index]) {
                trees[index] = createTree(parser, Tree, config);
            }

            trees[index].restoreFromDark();
            trees[index].setDirtyChecker(parser.dirtyChecker);

            var local = {
                key: k,
                index: index
            };
            local[itemVariableName] = exprValue[k];
            trees[index].setData(utils.extend({}, data, local));

            index++;
        }

        for (var i = index, il = trees.length; i < il; i++) {
            trees[i].goDark();
        }
    };
}

function createTree(parser, Tree, config) {
    var copySeg = parser.tplSeg.cloneNode(true);
    var startNode = copySeg.firstChild;
    var endNode = copySeg.lastChild;
    utils.traverseNodes(startNode, endNode, function (curNode) {
        parser.endNode.parentNode.insertBefore(curNode, parser.endNode);
    });

    var tree = new Tree({
        startNode: startNode,
        endNode: endNode,
        config: config
    });
    tree.traverse();
    return tree;
}

},{"./Parser":4,"./inherit":6,"./utils":7}],3:[function(require,module,exports){
/**
 * @file if 指令
 * @author yibuyisheng(yibuyisheng@163.com)
 */

var Parser = require('./Parser');
var inherit = require('./inherit');
var utils = require('./utils');

function IfDirectiveParser(options) {
    Parser.call(this, options);
}

IfDirectiveParser.prototype.initialize = function (options) {
    this.startNode = options.startNode;
    this.endNode = options.endNode;
    this.config = options.config;

    this.exprs = [];
    this.exprFns = {};
};

IfDirectiveParser.prototype.collectExprs = function () {
    var curNode = this.startNode;
    var branches = [];
    var branchIndex = -1;
    do {
        var nodeType = getIfNodeType(curNode, this.config);

        if (nodeType) {
            setEndNode(curNode, branches, branchIndex);

            branchIndex++;
            branches[branchIndex] = branches[branchIndex] || {};

            // 是 if 节点或者 elif 节点，搜集表达式
            if (nodeType < 3) {
                var expr = curNode.nodeValue.replace(this.config.getAllIfRegExp(), '');
                this.exprs.push(expr);

                if (!this.exprFns[expr]) {
                    this.exprFns[expr] = utils.createExprFn(this.config.getExprRegExp(), expr);
                }
            }
            else if (nodeType === 3) {
                this.hasElseBranch = true;
            }
        }
        else {
            if (!branches[branchIndex].startNode) {
                branches[branchIndex].startNode = curNode;
            }
        }

        curNode = curNode.nextSibling;
        if (!curNode || curNode === this.endNode) {
            setEndNode(curNode, branches, branchIndex);
            break;
        }
    } while (true);

    return branches;

    function setEndNode(curNode, branches, branchIndex) {
        if (branchIndex + 1 && branches[branchIndex].startNode) {
            branches[branchIndex].endNode = curNode.previousSibling;
        }
    }
};

IfDirectiveParser.prototype.setData = function (data) {
    var exprs = this.exprs;
    for (var i = 0, il = exprs.length; i < il; i++) {
        var expr = exprs[i];
        var exprValue = this.exprFns[expr](data);
        if (exprValue) {
            return i;
        }
    }

    if (this.hasElseBranch) {
        return i;
    }
};

IfDirectiveParser.isIfNode = function (node, config) {
    return getIfNodeType(node, config) === 1;
};

IfDirectiveParser.isElifNode = function (node, config) {
    return getIfNodeType(node, config) === 2;
};

IfDirectiveParser.isElseNode = function (node, config) {
    return getIfNodeType(node, config) === 3;
};

IfDirectiveParser.isIfEndNode = function (node, config) {
    return getIfNodeType(node, config) === 4;
};

IfDirectiveParser.findIfEnd = function (ifStartNode, config) {
    var curNode = ifStartNode;
    while ((curNode = curNode.nextSibling)) {
        if (IfDirectiveParser.isIfEndNode(curNode, config)) {
            return curNode;
        }
    }
};

module.exports = inherit(IfDirectiveParser, Parser);

function getIfNodeType(node, config) {
    if (node.nodeType !== 8) {
        return;
    }

    if (config.ifPrefixRegExp.test(node.nodeValue)) {
        return 1;
    }

    if (config.elifPrefixRegExp.test(node.nodeValue)) {
        return 2;
    }

    if (config.elsePrefixRegExp.test(node.nodeValue)) {
        return 3;
    }

    if (config.ifEndPrefixRegExp.test(node.nodeValue)) {
        return 4;
    }
}

},{"./Parser":4,"./inherit":6,"./utils":7}],4:[function(require,module,exports){
/**
 * @file 解析器的抽象基类
 * @author yibuyisheng(yibuyisheng@163.com)
 */

/**
 * 构造函数
 *
 * @constructor
 * @param {Object} options 配置参数，一般可能会有如下内容：
 *                         {
 *                             startNode: ...,
 *                             endNode: ...,
 *                             node: ...,
 *                             config: ...
 *                         }
 *                         具体是啥可以参加具体的子类
 */
function Parser(options) {
    this.initialize(options);
}

/**
 * 初始化
 *
 * @protected
 * @abstract
 * @param {Object} options 来自于构造函数
 */
Parser.prototype.initialize = function (options) {};

/**
 * 销毁解析器
 *
 * @public
 * @abstract
 */
Parser.prototype.destroy = function () {};

/**
 * 设置数据
 *
 * @public
 * @abstract
 * @param {Object} data 要设置的数据
 */
Parser.prototype.setData = function (data) {};

/**
 * 隐藏相关元素
 *
 * @public
 */
Parser.prototype.goDark = function () {};

/**
 * 显示相关元素
 *
 * @public
 */
Parser.prototype.restoreFromDark = function () {};

/**
 * 搜集表达式，生成表达式函数和 DOM 更新函数
 *
 * @abstract
 * @public
 */
Parser.prototype.collectExprs = function () {};

Parser.prototype.dirtyCheck = function (expr, exprValue, exprOldValue) {
    var dirtyCheckerFn = this.dirtyChecker ? this.dirtyChecker.getChecker(expr) : null;
    return (dirtyCheckerFn && dirtyCheckerFn(expr, exprValue, exprOldValue))
            || (!dirtyCheckerFn && exprValue !== exprOldValue);
};

Parser.prototype.setDirtyChecker = function (dirtyChecker) {
    this.dirtyChecker = dirtyChecker;
};

module.exports = Parser;

},{}],5:[function(require,module,exports){
/**
 * @file 最终的树
 * @author yibuyisheng(yibuyisheng@163.com)
 */

var IfDirectiveParser = require('./IfDirectiveParser');
var ExprParser = require('./ExprParser');
var ForDirectiveParser = require('./ForDirectiveParser');
var utils = require('./utils');

function Tree(options) {
    this.startNode = options.startNode;
    this.endNode = options.endNode;
    this.config = options.config;

    this.tree = [];
}

Tree.prototype.traverse = function () {
    walk(this, this.startNode, this.endNode, this.tree);
};

Tree.prototype.setData = function (data) {
    data = data || {};
    walkParsers(this, this.tree, data);
};

Tree.prototype.goDark = function () {
    var curNode = this.startNode;
    do {
        if (curNode.nodeType === 1 || curNode.nodeType === 3) {
            utils.goDark(curNode);
        }
    } while ((curNode = curNode.nextSibling) && curNode !== this.endNode);
};

Tree.prototype.restoreFromDark = function () {
    var curNode = this.startNode;
    do {
        if (curNode.nodeType === 1 || curNode.nodeType === 3) {
            utils.restoreFromDark(curNode);
        }
    } while ((curNode = curNode.nextSibling) && curNode !== this.endNode);
};

Tree.prototype.setDirtyChecker = function (dirtyChecker) {
    this.dirtyChecker = dirtyChecker;
};

module.exports = Tree;

function walkParsers(tree, parsers, data) {
    for (var i = 0, il = parsers.length; i < il; i++) {
        var parserObj = parsers[i];
        parserObj.parser.setDirtyChecker(tree.dirtyChecker);
        parserObj.data = utils.extend({}, parserObj.data || {}, data);

        if (parserObj.parser instanceof IfDirectiveParser) {
            var branchIndex = parserObj.parser.setData(parserObj.data);
            var branches = parserObj.children;
            for (var j = 0, jl = branches.length; j < jl; j++) {
                if (j === branchIndex) {
                    walkParsers(tree, branches[j], parserObj.data);
                    continue;
                }

                for (var z = 0, zl = branches[j].length; z < zl; z++) {
                    if (branches[j][z].parser instanceof ExprParser) {
                        branches[j][z].parser.goDark();
                    }
                }
            }
        }
        else {
            if (parserObj.parser instanceof ExprParser) {
                parserObj.parser.restoreFromDark();
            }
            parserObj.parser.setData(parserObj.data);
            if (parserObj.children) {
                walkParsers(tree, parserObj.children, parserObj.data);
            }
        }
    }
}

function walk(tree, startNode, endNode, container) {
    var curNode = startNode;
    do {
        if (!curNode) {
            break;
        }

        if (IfDirectiveParser.isIfNode(curNode, tree.config)) {
            var ifEndNode = IfDirectiveParser.findIfEnd(curNode, tree.config);
            if (!ifEndNode) {
                throw new Error('the if directive is not properly ended!');
            }

            var ifDirectiveParser = new IfDirectiveParser({
                startNode: curNode,
                endNode: ifEndNode,
                config: tree.config
            });

            var branches = ifDirectiveParser.collectExprs();
            container.push({parser: ifDirectiveParser, children: branches});
            for (var i = 0, il = branches.length; i < il; i++) {
                if (!branches[i].startNode || !branches[i].endNode) {
                    continue;
                }

                var ifCon = [];
                walk(tree, branches[i].startNode, branches[i].endNode, ifCon);
                branches[i] = ifCon;
            }

            curNode = ifEndNode.nextSibling;
            continue;
        }
        else if (ForDirectiveParser.isForNode(curNode, tree.config)) {
            var forEndNode = ForDirectiveParser.findForEnd(curNode, tree.config);
            if (!forEndNode) {
                throw new Error('the for directive is not properly ended!');
            }

            var forDirectiveParser = new ForDirectiveParser({
                startNode: curNode,
                endNode: forEndNode,
                config: tree.config,
                Tree: Tree
            });

            forDirectiveParser.collectExprs();
            container.push({parser: forDirectiveParser});

            curNode = forEndNode.nextSibling;
            continue;
        }
        else {
            var exprParser = new ExprParser({
                node: curNode,
                config: tree.config
            });
            exprParser.collectExprs();

            var con = [];
            container.push({parser: exprParser, children: con});
            if (curNode.nodeType === 1) {
                walk(tree, curNode.firstChild, curNode.lastChild, con);
            }
        }

        curNode = curNode.nextSibling;
    } while (curNode !== endNode);
}




},{"./ExprParser":1,"./ForDirectiveParser":2,"./IfDirectiveParser":3,"./utils":7}],6:[function(require,module,exports){
function inherit(ChildClass, ParentClass) {
    var childProto = ChildClass.prototype;
    ChildClass.prototype = new ParentClass();
    for (var key in childProto) {
        if (childProto.hasOwnProperty(key)) {
            ChildClass.prototype[key] = childProto[key];
        }
    }
    return ChildClass;
}

module.exports = inherit;
},{}],7:[function(require,module,exports){
exports.slice = function (arr, start, end) {
    return Array.prototype.slice.call(arr, start, end);
};

/**
 * 计算表达式的值
 *
 * @inner
 * @param  {string} expression 表达式字符串，类似于 `${name}` 中的 name
 * @param  {Object} curData    当前表达式对应的数据
 * @return {string}            计算结果
 */
exports.calculateExpression = function (expression, curData) {
    var params = getVariableNamesFromExpr(expression);

    var fnArgs = [];
    for (var i = 0, il = params.length; i < il; i++) {
        var param = params[i];
        var value = curData[param];
        fnArgs.push(value === undefined ? '' : value);
    }

    var result;
    try {
        result = (new Function(params, 'return ' + expression)).apply(null, fnArgs);
    }
    catch (e) {
        result = '';
    }

    return result;
};

exports.goDark = function (node) {
    if (node.nodeType === 1) {
        node.style.display = 'none';
    }
    else if (node.nodeType === 3) {
        node.__text__ = node.nodeValue;
        node.nodeValue = '';
    }
};

exports.restoreFromDark = function (node) {
    if (node.nodeType === 1) {
        node.style.display = null;
    }
    else if (node.nodeType === 3) {
        if (node.__text__ !== undefined) {
            node.nodeValue = node.__text__;
            node.__text__ = undefined;
        }
    }
};

exports.createExprFn = function (exprRegExp, expr) {
    expr = expr.replace(exprRegExp, function () {
        return arguments[1];
    });

    return function (data) {
        return exports.calculateExpression(expr, data);
    };
};

/**
 * 超级简单的 extend ，因为本库对 extend 没那高的要求，
 * 等到有要求的时候再完善。
 *
 * @inner
 * @param  {Object} target 目标对象
 * @return {Object}        最终合并后的对象
 */
exports.extend = function (target) {
    var srcs = exports.slice(arguments, 1);
    for (var i = 0, il = srcs.length; i < il; i++) {
        for (var key in srcs[i]) {
            target[key] = srcs[i][key];
        }
    }
    return target;
};

exports.traverseNodes = function (startNode, endNode, nodeFn, context) {
    var nodes = [];
    for (var curNode = startNode;
        curNode && curNode !== endNode;
        curNode = curNode.nextSibling
    ) {
        nodes.push(curNode);
    }

    nodes.push(endNode);

    exports.each(nodes, nodeFn, context);
};

exports.each = function (arr, fn, context) {
    if (exports.isArray(arr)) {
        for (var i = 0, il = arr.length; i < il; i++) {
            if (fn.call(context, arr[i], i, arr)) {
                break;
            }
        }
    }
    else if (typeof arr === 'object') {
        for (var k in arr) {
            if (fn.call(context, arr[k], k, arr)) {
                break;
            }
        }
    }
};

exports.isArray = function (arr) {
    return Object.prototype.toString.call(arr) === 'object Array';
};

/**
 * 从表达式中抽离出变量名
 *
 * @inner
 * @param  {string} expr 表达式字符串，类似于 `${name}` 中的 name
 * @return {Array.<string>}      变量名数组
 */
var exprNameMap = {};
var exprNameRegExp = /\.?\$?([a-z|A-Z]+|([a-z|A-Z]+[0-9]+[a-z|A-Z]*))/g;
function getVariableNamesFromExpr(expr) {
    if (exprNameMap[expr]) {
        return exprNameMap[expr];
    }

    var matches = expr.match(exprNameRegExp) || [];
    var names = [];
    for (var i = 0, il = matches.length; i < il; i++) {
        if (matches[i] && matches[i][0] !== '.') {
            names.push(matches[i]);
        }
    }

    exprNameMap[expr] = names;

    return names;
}

},{}],8:[function(require,module,exports){
window.Tree = module.exports = require('../src/Tree.js');
},{"../src/Tree.js":5}]},{},[8])
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi9Vc2Vycy9iYWlkdS9kb20tZGF0YS1iaW5kL25vZGVfbW9kdWxlcy9ndWxwLWJyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXItcGFjay9fcHJlbHVkZS5qcyIsIi9Vc2Vycy9iYWlkdS9kb20tZGF0YS1iaW5kL3NyYy9FeHByUGFyc2VyLmpzIiwiL1VzZXJzL2JhaWR1L2RvbS1kYXRhLWJpbmQvc3JjL0ZvckRpcmVjdGl2ZVBhcnNlci5qcyIsIi9Vc2Vycy9iYWlkdS9kb20tZGF0YS1iaW5kL3NyYy9JZkRpcmVjdGl2ZVBhcnNlci5qcyIsIi9Vc2Vycy9iYWlkdS9kb20tZGF0YS1iaW5kL3NyYy9QYXJzZXIuanMiLCIvVXNlcnMvYmFpZHUvZG9tLWRhdGEtYmluZC9zcmMvVHJlZS5qcyIsIi9Vc2Vycy9iYWlkdS9kb20tZGF0YS1iaW5kL3NyYy9pbmhlcml0LmpzIiwiL1VzZXJzL2JhaWR1L2RvbS1kYXRhLWJpbmQvc3JjL3V0aWxzLmpzIiwiL1VzZXJzL2JhaWR1L2RvbS1kYXRhLWJpbmQvdG1wL2Zha2VfMTRiYmM1OWIuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDL0ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNUhBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcklBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOUpBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNYQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoSkEiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dGhyb3cgbmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKX12YXIgZj1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwoZi5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxmLGYuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiLyoqXG4gKiBAZmlsZSDooajovr7lvI/op6PmnpDlmajvvIzkuIDkuKrmlofmnKzoioLngrnmiJbogIXlhYPntKDoioLngrnlr7nlupTkuIDkuKrooajovr7lvI/op6PmnpDlmajlrp7kvotcbiAqIEBhdXRob3IgeWlidXlpc2hlbmcoeWlidXlpc2hlbmdAMTYzLmNvbSlcbiAqL1xuXG52YXIgUGFyc2VyID0gcmVxdWlyZSgnLi9QYXJzZXInKTtcbnZhciBpbmhlcml0ID0gcmVxdWlyZSgnLi9pbmhlcml0Jyk7XG52YXIgdXRpbHMgPSByZXF1aXJlKCcuL3V0aWxzJyk7XG5cbmZ1bmN0aW9uIEV4cHJQYXJzZXIob3B0aW9ucykge1xuICAgIFBhcnNlci5jYWxsKHRoaXMsIG9wdGlvbnMpO1xufVxuXG5FeHByUGFyc2VyLnByb3RvdHlwZS5pbml0aWFsaXplID0gZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICB0aGlzLm5vZGUgPSBvcHRpb25zLm5vZGU7XG4gICAgdGhpcy5jb25maWcgPSBvcHRpb25zLmNvbmZpZztcblxuICAgIHRoaXMuZXhwcnMgPSBbXTtcbiAgICB0aGlzLmV4cHJGbnMgPSB7fTtcbiAgICB0aGlzLnVwZGF0ZUZucyA9IHt9O1xuICAgIHRoaXMuZXhwck9sZFZhbHVlcyA9IHt9O1xufTtcblxuRXhwclBhcnNlci5wcm90b3R5cGUuY29sbGVjdEV4cHJzID0gZnVuY3Rpb24gKCkge1xuICAgIHZhciBjdXJOb2RlID0gdGhpcy5ub2RlO1xuXG4gICAgLy8g5paH5pys6IqC54K5XG4gICAgaWYgKGN1ck5vZGUubm9kZVR5cGUgPT09IDMpIHtcbiAgICAgICAgYWRkRXhwcih0aGlzLCBjdXJOb2RlLm5vZGVWYWx1ZSwgKGZ1bmN0aW9uIChjdXJOb2RlKSB7XG4gICAgICAgICAgICByZXR1cm4gZnVuY3Rpb24gKGV4cHJWYWx1ZSkge1xuICAgICAgICAgICAgICAgIGN1ck5vZGUubm9kZVZhbHVlID0gZXhwclZhbHVlO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgfSkoY3VyTm9kZSkpO1xuICAgIH1cbiAgICAvLyDlhYPntKDoioLngrlcbiAgICBlbHNlIGlmIChjdXJOb2RlLm5vZGVUeXBlID09PSAxKSB7XG4gICAgICAgIHZhciBhdHRyaWJ1dGVzID0gY3VyTm9kZS5hdHRyaWJ1dGVzO1xuICAgICAgICBmb3IgKHZhciBpID0gMCwgaWwgPSBhdHRyaWJ1dGVzLmxlbmd0aDsgaSA8IGlsOyBpKyspIHtcbiAgICAgICAgICAgIHZhciBhdHRyID0gYXR0cmlidXRlc1tpXTtcbiAgICAgICAgICAgIGFkZEV4cHIodGhpcywgYXR0ci52YWx1ZSwgY3JlYXRlQXR0clVwZGF0ZUZuKGF0dHIpKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGNyZWF0ZUF0dHJVcGRhdGVGbihhdHRyKSB7XG4gICAgICAgIHJldHVybiBmdW5jdGlvbiAoZXhwclZhbHVlKSB7XG4gICAgICAgICAgICBhdHRyLnZhbHVlID0gZXhwclZhbHVlO1xuICAgICAgICB9O1xuICAgIH1cbn07XG5cbkV4cHJQYXJzZXIucHJvdG90eXBlLnNldERhdGEgPSBmdW5jdGlvbiAoZGF0YSkge1xuICAgIHZhciBleHBycyA9IHRoaXMuZXhwcnM7XG4gICAgdmFyIGV4cHJPbGRWYWx1ZXMgPSB0aGlzLmV4cHJPbGRWYWx1ZXM7XG4gICAgZm9yICh2YXIgaSA9IDAsIGlsID0gZXhwcnMubGVuZ3RoOyBpIDwgaWw7IGkrKykge1xuICAgICAgICB2YXIgZXhwciA9IGV4cHJzW2ldO1xuICAgICAgICB2YXIgZXhwclZhbHVlID0gdGhpcy5leHByRm5zW2V4cHJdKGRhdGEpO1xuXG4gICAgICAgIGlmICh0aGlzLmRpcnR5Q2hlY2soZXhwciwgZXhwclZhbHVlLCBleHByT2xkVmFsdWVzW2V4cHJdKSkge1xuICAgICAgICAgICAgdmFyIHVwZGF0ZUZucyA9IHRoaXMudXBkYXRlRm5zW2V4cHJdO1xuICAgICAgICAgICAgZm9yICh2YXIgaiA9IDAsIGpsID0gdXBkYXRlRm5zLmxlbmd0aDsgaiA8IGpsOyBqKyspIHtcbiAgICAgICAgICAgICAgICB1cGRhdGVGbnNbal0oZXhwclZhbHVlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGV4cHJPbGRWYWx1ZXNbZXhwcl0gPSBleHByVmFsdWU7XG4gICAgfVxufTtcblxuRXhwclBhcnNlci5wcm90b3R5cGUuZ29EYXJrID0gZnVuY3Rpb24gKCkge1xuICAgIHV0aWxzLmdvRGFyayh0aGlzLm5vZGUpO1xufTtcblxuRXhwclBhcnNlci5wcm90b3R5cGUucmVzdG9yZUZyb21EYXJrID0gZnVuY3Rpb24gKCkge1xuICAgIHV0aWxzLnJlc3RvcmVGcm9tRGFyayh0aGlzLm5vZGUpO1xufTtcblxuXG5tb2R1bGUuZXhwb3J0cyA9IGluaGVyaXQoRXhwclBhcnNlciwgUGFyc2VyKTtcblxuZnVuY3Rpb24gYWRkRXhwcihwYXJzZXIsIGV4cHIsIHVwZGF0ZUZuKSB7XG4gICAgcGFyc2VyLmV4cHJzLnB1c2goZXhwcik7XG4gICAgaWYgKCFwYXJzZXIuZXhwckZuc1tleHByXSkge1xuICAgICAgICBwYXJzZXIuZXhwckZuc1tleHByXSA9IGNyZWF0ZUV4cHJGbihwYXJzZXIuY29uZmlnLmdldEV4cHJSZWdFeHAoKSwgZXhwcik7XG4gICAgfVxuICAgIHBhcnNlci51cGRhdGVGbnNbZXhwcl0gPSBwYXJzZXIudXBkYXRlRm5zW2V4cHJdIHx8IFtdO1xuICAgIHBhcnNlci51cGRhdGVGbnNbZXhwcl0ucHVzaCh1cGRhdGVGbik7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUV4cHJGbihleHByUmVnRXhwLCBleHByKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uIChkYXRhKSB7XG4gICAgICAgIHJldHVybiBleHByLnJlcGxhY2UoZXhwclJlZ0V4cCwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuIHV0aWxzLmNhbGN1bGF0ZUV4cHJlc3Npb24oYXJndW1lbnRzWzFdLCBkYXRhKTtcbiAgICAgICAgfSk7XG4gICAgfTtcbn1cbiIsIi8qKlxuICogQGZpbGUgZm9yIOaMh+S7pFxuICogQGF1dGhvciB5aWJ1eWlzaGVuZyh5aWJ1eWlzaGVuZ0AxNjMuY29tKVxuICovXG5cbnZhciBpbmhlcml0ID0gcmVxdWlyZSgnLi9pbmhlcml0Jyk7XG52YXIgUGFyc2VyID0gcmVxdWlyZSgnLi9QYXJzZXInKTtcbnZhciB1dGlscyA9IHJlcXVpcmUoJy4vdXRpbHMnKTtcblxuZnVuY3Rpb24gRm9yRGlyZWN0aXZlUGFyc2VyKG9wdGlvbnMpIHtcbiAgICBQYXJzZXIuY2FsbCh0aGlzLCBvcHRpb25zKTtcbn1cblxuRm9yRGlyZWN0aXZlUGFyc2VyLnByb3RvdHlwZS5pbml0aWFsaXplID0gZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICB0aGlzLnN0YXJ0Tm9kZSA9IG9wdGlvbnMuc3RhcnROb2RlO1xuICAgIHRoaXMuZW5kTm9kZSA9IG9wdGlvbnMuZW5kTm9kZTtcbiAgICB0aGlzLmNvbmZpZyA9IG9wdGlvbnMuY29uZmlnO1xuICAgIHRoaXMuVHJlZSA9IG9wdGlvbnMuVHJlZTtcbn07XG5cbkZvckRpcmVjdGl2ZVBhcnNlci5wcm90b3R5cGUuY29sbGVjdEV4cHJzID0gZnVuY3Rpb24gKCkge1xuICAgIGlmICh0aGlzLnN0YXJ0Tm9kZS5uZXh0U2libGluZyA9PT0gdGhpcy5lbmROb2RlKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB2YXIgdHBsU2VnID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgdXRpbHMudHJhdmVyc2VOb2Rlcyh0aGlzLnN0YXJ0Tm9kZSwgdGhpcy5lbmROb2RlLCBmdW5jdGlvbiAoY3VyTm9kZSkge1xuICAgICAgICBpZiAoY3VyTm9kZSA9PT0gdGhpcy5zdGFydE5vZGUgfHwgY3VyTm9kZSA9PT0gdGhpcy5lbmROb2RlKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICB0cGxTZWcuYXBwZW5kQ2hpbGQoY3VyTm9kZSk7XG4gICAgfSwgdGhpcyk7XG4gICAgdGhpcy50cGxTZWcgPSB0cGxTZWc7XG5cbiAgICB0aGlzLmV4cHIgPSB0aGlzLnN0YXJ0Tm9kZS5ub2RlVmFsdWUubWF0Y2godGhpcy5jb25maWcuZ2V0Rm9yRXhwcnNSZWdFeHAoKSlbMV07XG4gICAgdGhpcy5leHByRm4gPSB1dGlscy5jcmVhdGVFeHByRm4odGhpcy5jb25maWcuZ2V0RXhwclJlZ0V4cCgpLCB0aGlzLmV4cHIpO1xuICAgIHRoaXMudXBkYXRlRm4gPSBjcmVhdGVVcGRhdGVGbihcbiAgICAgICAgdGhpcyxcbiAgICAgICAgdGhpcy5UcmVlLFxuICAgICAgICB0aGlzLnN0YXJ0Tm9kZS5uZXh0U2libGluZyxcbiAgICAgICAgdGhpcy5lbmROb2RlLnByZXZpb3VzU2libGluZyxcbiAgICAgICAgdGhpcy5jb25maWcsXG4gICAgICAgIHRoaXMuc3RhcnROb2RlLm5vZGVWYWx1ZVxuICAgICk7XG59O1xuXG5Gb3JEaXJlY3RpdmVQYXJzZXIucHJvdG90eXBlLnNldERhdGEgPSBmdW5jdGlvbiAoZGF0YSkge1xuICAgIGlmICghdGhpcy5leHByKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB2YXIgZXhwclZhbHVlID0gdGhpcy5leHByRm4oZGF0YSk7XG4gICAgaWYgKHRoaXMuZGlydHlDaGVjayh0aGlzLmV4cHIsIGV4cHJWYWx1ZSwgdGhpcy5leHByT2xkVmFsdWUpKSB7XG4gICAgICAgIHRoaXMudXBkYXRlRm4oZXhwclZhbHVlLCBkYXRhKTtcbiAgICB9XG5cbiAgICB0aGlzLmV4cHJPbGRWYWx1ZSA9IGV4cHJWYWx1ZTtcbn07XG5cbkZvckRpcmVjdGl2ZVBhcnNlci5pc0Zvck5vZGUgPSBmdW5jdGlvbiAobm9kZSwgY29uZmlnKSB7XG4gICAgcmV0dXJuIG5vZGUubm9kZVR5cGUgPT09IDggJiYgY29uZmlnLmZvclByZWZpeFJlZ0V4cC50ZXN0KG5vZGUubm9kZVZhbHVlKTtcbn07XG5cbkZvckRpcmVjdGl2ZVBhcnNlci5pc0ZvckVuZE5vZGUgPSBmdW5jdGlvbiAobm9kZSwgY29uZmlnKSB7XG4gICAgcmV0dXJuIG5vZGUubm9kZVR5cGUgPT09IDggJiYgY29uZmlnLmZvckVuZFByZWZpeFJlZ0V4cC50ZXN0KG5vZGUubm9kZVZhbHVlKTtcbn07XG5cbkZvckRpcmVjdGl2ZVBhcnNlci5maW5kRm9yRW5kID0gZnVuY3Rpb24gKGZvclN0YXJ0Tm9kZSwgY29uZmlnKSB7XG4gICAgdmFyIGN1ck5vZGUgPSBmb3JTdGFydE5vZGU7XG4gICAgd2hpbGUgKChjdXJOb2RlID0gY3VyTm9kZS5uZXh0U2libGluZykpIHtcbiAgICAgICAgaWYgKEZvckRpcmVjdGl2ZVBhcnNlci5pc0ZvckVuZE5vZGUoY3VyTm9kZSwgY29uZmlnKSkge1xuICAgICAgICAgICAgcmV0dXJuIGN1ck5vZGU7XG4gICAgICAgIH1cbiAgICB9XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IGluaGVyaXQoRm9yRGlyZWN0aXZlUGFyc2VyLCBQYXJzZXIpO1xuXG5mdW5jdGlvbiBjcmVhdGVVcGRhdGVGbihwYXJzZXIsIFRyZWUsIHN0YXJ0Tm9kZSwgZW5kTm9kZSwgY29uZmlnLCBmdWxsRXhwcikge1xuICAgIHZhciB0cmVlcyA9IFtdO1xuICAgIHZhciBpdGVtVmFyaWFibGVOYW1lID0gZnVsbEV4cHIubWF0Y2gocGFyc2VyLmNvbmZpZy5nZXRGb3JJdGVtVmFsdWVOYW1lUmVnRXhwKCkpWzFdO1xuICAgIHJldHVybiBmdW5jdGlvbiAoZXhwclZhbHVlLCBkYXRhKSB7XG4gICAgICAgIHZhciBpbmRleCA9IDA7XG4gICAgICAgIGZvciAodmFyIGsgaW4gZXhwclZhbHVlKSB7XG4gICAgICAgICAgICBpZiAoIXRyZWVzW2luZGV4XSkge1xuICAgICAgICAgICAgICAgIHRyZWVzW2luZGV4XSA9IGNyZWF0ZVRyZWUocGFyc2VyLCBUcmVlLCBjb25maWcpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0cmVlc1tpbmRleF0ucmVzdG9yZUZyb21EYXJrKCk7XG4gICAgICAgICAgICB0cmVlc1tpbmRleF0uc2V0RGlydHlDaGVja2VyKHBhcnNlci5kaXJ0eUNoZWNrZXIpO1xuXG4gICAgICAgICAgICB2YXIgbG9jYWwgPSB7XG4gICAgICAgICAgICAgICAga2V5OiBrLFxuICAgICAgICAgICAgICAgIGluZGV4OiBpbmRleFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIGxvY2FsW2l0ZW1WYXJpYWJsZU5hbWVdID0gZXhwclZhbHVlW2tdO1xuICAgICAgICAgICAgdHJlZXNbaW5kZXhdLnNldERhdGEodXRpbHMuZXh0ZW5kKHt9LCBkYXRhLCBsb2NhbCkpO1xuXG4gICAgICAgICAgICBpbmRleCsrO1xuICAgICAgICB9XG5cbiAgICAgICAgZm9yICh2YXIgaSA9IGluZGV4LCBpbCA9IHRyZWVzLmxlbmd0aDsgaSA8IGlsOyBpKyspIHtcbiAgICAgICAgICAgIHRyZWVzW2ldLmdvRGFyaygpO1xuICAgICAgICB9XG4gICAgfTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlVHJlZShwYXJzZXIsIFRyZWUsIGNvbmZpZykge1xuICAgIHZhciBjb3B5U2VnID0gcGFyc2VyLnRwbFNlZy5jbG9uZU5vZGUodHJ1ZSk7XG4gICAgdmFyIHN0YXJ0Tm9kZSA9IGNvcHlTZWcuZmlyc3RDaGlsZDtcbiAgICB2YXIgZW5kTm9kZSA9IGNvcHlTZWcubGFzdENoaWxkO1xuICAgIHV0aWxzLnRyYXZlcnNlTm9kZXMoc3RhcnROb2RlLCBlbmROb2RlLCBmdW5jdGlvbiAoY3VyTm9kZSkge1xuICAgICAgICBwYXJzZXIuZW5kTm9kZS5wYXJlbnROb2RlLmluc2VydEJlZm9yZShjdXJOb2RlLCBwYXJzZXIuZW5kTm9kZSk7XG4gICAgfSk7XG5cbiAgICB2YXIgdHJlZSA9IG5ldyBUcmVlKHtcbiAgICAgICAgc3RhcnROb2RlOiBzdGFydE5vZGUsXG4gICAgICAgIGVuZE5vZGU6IGVuZE5vZGUsXG4gICAgICAgIGNvbmZpZzogY29uZmlnXG4gICAgfSk7XG4gICAgdHJlZS50cmF2ZXJzZSgpO1xuICAgIHJldHVybiB0cmVlO1xufVxuIiwiLyoqXG4gKiBAZmlsZSBpZiDmjIfku6RcbiAqIEBhdXRob3IgeWlidXlpc2hlbmcoeWlidXlpc2hlbmdAMTYzLmNvbSlcbiAqL1xuXG52YXIgUGFyc2VyID0gcmVxdWlyZSgnLi9QYXJzZXInKTtcbnZhciBpbmhlcml0ID0gcmVxdWlyZSgnLi9pbmhlcml0Jyk7XG52YXIgdXRpbHMgPSByZXF1aXJlKCcuL3V0aWxzJyk7XG5cbmZ1bmN0aW9uIElmRGlyZWN0aXZlUGFyc2VyKG9wdGlvbnMpIHtcbiAgICBQYXJzZXIuY2FsbCh0aGlzLCBvcHRpb25zKTtcbn1cblxuSWZEaXJlY3RpdmVQYXJzZXIucHJvdG90eXBlLmluaXRpYWxpemUgPSBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgIHRoaXMuc3RhcnROb2RlID0gb3B0aW9ucy5zdGFydE5vZGU7XG4gICAgdGhpcy5lbmROb2RlID0gb3B0aW9ucy5lbmROb2RlO1xuICAgIHRoaXMuY29uZmlnID0gb3B0aW9ucy5jb25maWc7XG5cbiAgICB0aGlzLmV4cHJzID0gW107XG4gICAgdGhpcy5leHByRm5zID0ge307XG59O1xuXG5JZkRpcmVjdGl2ZVBhcnNlci5wcm90b3R5cGUuY29sbGVjdEV4cHJzID0gZnVuY3Rpb24gKCkge1xuICAgIHZhciBjdXJOb2RlID0gdGhpcy5zdGFydE5vZGU7XG4gICAgdmFyIGJyYW5jaGVzID0gW107XG4gICAgdmFyIGJyYW5jaEluZGV4ID0gLTE7XG4gICAgZG8ge1xuICAgICAgICB2YXIgbm9kZVR5cGUgPSBnZXRJZk5vZGVUeXBlKGN1ck5vZGUsIHRoaXMuY29uZmlnKTtcblxuICAgICAgICBpZiAobm9kZVR5cGUpIHtcbiAgICAgICAgICAgIHNldEVuZE5vZGUoY3VyTm9kZSwgYnJhbmNoZXMsIGJyYW5jaEluZGV4KTtcblxuICAgICAgICAgICAgYnJhbmNoSW5kZXgrKztcbiAgICAgICAgICAgIGJyYW5jaGVzW2JyYW5jaEluZGV4XSA9IGJyYW5jaGVzW2JyYW5jaEluZGV4XSB8fCB7fTtcblxuICAgICAgICAgICAgLy8g5pivIGlmIOiKgueCueaIluiAhSBlbGlmIOiKgueCue+8jOaQnOmbhuihqOi+vuW8j1xuICAgICAgICAgICAgaWYgKG5vZGVUeXBlIDwgMykge1xuICAgICAgICAgICAgICAgIHZhciBleHByID0gY3VyTm9kZS5ub2RlVmFsdWUucmVwbGFjZSh0aGlzLmNvbmZpZy5nZXRBbGxJZlJlZ0V4cCgpLCAnJyk7XG4gICAgICAgICAgICAgICAgdGhpcy5leHBycy5wdXNoKGV4cHIpO1xuXG4gICAgICAgICAgICAgICAgaWYgKCF0aGlzLmV4cHJGbnNbZXhwcl0pIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5leHByRm5zW2V4cHJdID0gdXRpbHMuY3JlYXRlRXhwckZuKHRoaXMuY29uZmlnLmdldEV4cHJSZWdFeHAoKSwgZXhwcik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAobm9kZVR5cGUgPT09IDMpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmhhc0Vsc2VCcmFuY2ggPSB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgaWYgKCFicmFuY2hlc1ticmFuY2hJbmRleF0uc3RhcnROb2RlKSB7XG4gICAgICAgICAgICAgICAgYnJhbmNoZXNbYnJhbmNoSW5kZXhdLnN0YXJ0Tm9kZSA9IGN1ck5vZGU7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBjdXJOb2RlID0gY3VyTm9kZS5uZXh0U2libGluZztcbiAgICAgICAgaWYgKCFjdXJOb2RlIHx8IGN1ck5vZGUgPT09IHRoaXMuZW5kTm9kZSkge1xuICAgICAgICAgICAgc2V0RW5kTm9kZShjdXJOb2RlLCBicmFuY2hlcywgYnJhbmNoSW5kZXgpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICB9IHdoaWxlICh0cnVlKTtcblxuICAgIHJldHVybiBicmFuY2hlcztcblxuICAgIGZ1bmN0aW9uIHNldEVuZE5vZGUoY3VyTm9kZSwgYnJhbmNoZXMsIGJyYW5jaEluZGV4KSB7XG4gICAgICAgIGlmIChicmFuY2hJbmRleCArIDEgJiYgYnJhbmNoZXNbYnJhbmNoSW5kZXhdLnN0YXJ0Tm9kZSkge1xuICAgICAgICAgICAgYnJhbmNoZXNbYnJhbmNoSW5kZXhdLmVuZE5vZGUgPSBjdXJOb2RlLnByZXZpb3VzU2libGluZztcbiAgICAgICAgfVxuICAgIH1cbn07XG5cbklmRGlyZWN0aXZlUGFyc2VyLnByb3RvdHlwZS5zZXREYXRhID0gZnVuY3Rpb24gKGRhdGEpIHtcbiAgICB2YXIgZXhwcnMgPSB0aGlzLmV4cHJzO1xuICAgIGZvciAodmFyIGkgPSAwLCBpbCA9IGV4cHJzLmxlbmd0aDsgaSA8IGlsOyBpKyspIHtcbiAgICAgICAgdmFyIGV4cHIgPSBleHByc1tpXTtcbiAgICAgICAgdmFyIGV4cHJWYWx1ZSA9IHRoaXMuZXhwckZuc1tleHByXShkYXRhKTtcbiAgICAgICAgaWYgKGV4cHJWYWx1ZSkge1xuICAgICAgICAgICAgcmV0dXJuIGk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAodGhpcy5oYXNFbHNlQnJhbmNoKSB7XG4gICAgICAgIHJldHVybiBpO1xuICAgIH1cbn07XG5cbklmRGlyZWN0aXZlUGFyc2VyLmlzSWZOb2RlID0gZnVuY3Rpb24gKG5vZGUsIGNvbmZpZykge1xuICAgIHJldHVybiBnZXRJZk5vZGVUeXBlKG5vZGUsIGNvbmZpZykgPT09IDE7XG59O1xuXG5JZkRpcmVjdGl2ZVBhcnNlci5pc0VsaWZOb2RlID0gZnVuY3Rpb24gKG5vZGUsIGNvbmZpZykge1xuICAgIHJldHVybiBnZXRJZk5vZGVUeXBlKG5vZGUsIGNvbmZpZykgPT09IDI7XG59O1xuXG5JZkRpcmVjdGl2ZVBhcnNlci5pc0Vsc2VOb2RlID0gZnVuY3Rpb24gKG5vZGUsIGNvbmZpZykge1xuICAgIHJldHVybiBnZXRJZk5vZGVUeXBlKG5vZGUsIGNvbmZpZykgPT09IDM7XG59O1xuXG5JZkRpcmVjdGl2ZVBhcnNlci5pc0lmRW5kTm9kZSA9IGZ1bmN0aW9uIChub2RlLCBjb25maWcpIHtcbiAgICByZXR1cm4gZ2V0SWZOb2RlVHlwZShub2RlLCBjb25maWcpID09PSA0O1xufTtcblxuSWZEaXJlY3RpdmVQYXJzZXIuZmluZElmRW5kID0gZnVuY3Rpb24gKGlmU3RhcnROb2RlLCBjb25maWcpIHtcbiAgICB2YXIgY3VyTm9kZSA9IGlmU3RhcnROb2RlO1xuICAgIHdoaWxlICgoY3VyTm9kZSA9IGN1ck5vZGUubmV4dFNpYmxpbmcpKSB7XG4gICAgICAgIGlmIChJZkRpcmVjdGl2ZVBhcnNlci5pc0lmRW5kTm9kZShjdXJOb2RlLCBjb25maWcpKSB7XG4gICAgICAgICAgICByZXR1cm4gY3VyTm9kZTtcbiAgICAgICAgfVxuICAgIH1cbn07XG5cbm1vZHVsZS5leHBvcnRzID0gaW5oZXJpdChJZkRpcmVjdGl2ZVBhcnNlciwgUGFyc2VyKTtcblxuZnVuY3Rpb24gZ2V0SWZOb2RlVHlwZShub2RlLCBjb25maWcpIHtcbiAgICBpZiAobm9kZS5ub2RlVHlwZSAhPT0gOCkge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKGNvbmZpZy5pZlByZWZpeFJlZ0V4cC50ZXN0KG5vZGUubm9kZVZhbHVlKSkge1xuICAgICAgICByZXR1cm4gMTtcbiAgICB9XG5cbiAgICBpZiAoY29uZmlnLmVsaWZQcmVmaXhSZWdFeHAudGVzdChub2RlLm5vZGVWYWx1ZSkpIHtcbiAgICAgICAgcmV0dXJuIDI7XG4gICAgfVxuXG4gICAgaWYgKGNvbmZpZy5lbHNlUHJlZml4UmVnRXhwLnRlc3Qobm9kZS5ub2RlVmFsdWUpKSB7XG4gICAgICAgIHJldHVybiAzO1xuICAgIH1cblxuICAgIGlmIChjb25maWcuaWZFbmRQcmVmaXhSZWdFeHAudGVzdChub2RlLm5vZGVWYWx1ZSkpIHtcbiAgICAgICAgcmV0dXJuIDQ7XG4gICAgfVxufVxuIiwiLyoqXG4gKiBAZmlsZSDop6PmnpDlmajnmoTmir3osaHln7rnsbtcbiAqIEBhdXRob3IgeWlidXlpc2hlbmcoeWlidXlpc2hlbmdAMTYzLmNvbSlcbiAqL1xuXG4vKipcbiAqIOaehOmAoOWHveaVsFxuICpcbiAqIEBjb25zdHJ1Y3RvclxuICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMg6YWN572u5Y+C5pWw77yM5LiA6Iis5Y+v6IO95Lya5pyJ5aaC5LiL5YaF5a6577yaXG4gKiAgICAgICAgICAgICAgICAgICAgICAgICB7XG4gKiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc3RhcnROb2RlOiAuLi4sXG4gKiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZW5kTm9kZTogLi4uLFxuICogICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5vZGU6IC4uLixcbiAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25maWc6IC4uLlxuICogICAgICAgICAgICAgICAgICAgICAgICAgfVxuICogICAgICAgICAgICAgICAgICAgICAgICAg5YW35L2T5piv5ZWl5Y+v5Lul5Y+C5Yqg5YW35L2T55qE5a2Q57G7XG4gKi9cbmZ1bmN0aW9uIFBhcnNlcihvcHRpb25zKSB7XG4gICAgdGhpcy5pbml0aWFsaXplKG9wdGlvbnMpO1xufVxuXG4vKipcbiAqIOWIneWni+WMllxuICpcbiAqIEBwcm90ZWN0ZWRcbiAqIEBhYnN0cmFjdFxuICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMg5p2l6Ieq5LqO5p6E6YCg5Ye95pWwXG4gKi9cblBhcnNlci5wcm90b3R5cGUuaW5pdGlhbGl6ZSA9IGZ1bmN0aW9uIChvcHRpb25zKSB7fTtcblxuLyoqXG4gKiDplIDmr4Hop6PmnpDlmahcbiAqXG4gKiBAcHVibGljXG4gKiBAYWJzdHJhY3RcbiAqL1xuUGFyc2VyLnByb3RvdHlwZS5kZXN0cm95ID0gZnVuY3Rpb24gKCkge307XG5cbi8qKlxuICog6K6+572u5pWw5o2uXG4gKlxuICogQHB1YmxpY1xuICogQGFic3RyYWN0XG4gKiBAcGFyYW0ge09iamVjdH0gZGF0YSDopoHorr7nva7nmoTmlbDmja5cbiAqL1xuUGFyc2VyLnByb3RvdHlwZS5zZXREYXRhID0gZnVuY3Rpb24gKGRhdGEpIHt9O1xuXG4vKipcbiAqIOmakOiXj+ebuOWFs+WFg+e0oFxuICpcbiAqIEBwdWJsaWNcbiAqL1xuUGFyc2VyLnByb3RvdHlwZS5nb0RhcmsgPSBmdW5jdGlvbiAoKSB7fTtcblxuLyoqXG4gKiDmmL7npLrnm7jlhbPlhYPntKBcbiAqXG4gKiBAcHVibGljXG4gKi9cblBhcnNlci5wcm90b3R5cGUucmVzdG9yZUZyb21EYXJrID0gZnVuY3Rpb24gKCkge307XG5cbi8qKlxuICog5pCc6ZuG6KGo6L6+5byP77yM55Sf5oiQ6KGo6L6+5byP5Ye95pWw5ZKMIERPTSDmm7TmlrDlh73mlbBcbiAqXG4gKiBAYWJzdHJhY3RcbiAqIEBwdWJsaWNcbiAqL1xuUGFyc2VyLnByb3RvdHlwZS5jb2xsZWN0RXhwcnMgPSBmdW5jdGlvbiAoKSB7fTtcblxuUGFyc2VyLnByb3RvdHlwZS5kaXJ0eUNoZWNrID0gZnVuY3Rpb24gKGV4cHIsIGV4cHJWYWx1ZSwgZXhwck9sZFZhbHVlKSB7XG4gICAgdmFyIGRpcnR5Q2hlY2tlckZuID0gdGhpcy5kaXJ0eUNoZWNrZXIgPyB0aGlzLmRpcnR5Q2hlY2tlci5nZXRDaGVja2VyKGV4cHIpIDogbnVsbDtcbiAgICByZXR1cm4gKGRpcnR5Q2hlY2tlckZuICYmIGRpcnR5Q2hlY2tlckZuKGV4cHIsIGV4cHJWYWx1ZSwgZXhwck9sZFZhbHVlKSlcbiAgICAgICAgICAgIHx8ICghZGlydHlDaGVja2VyRm4gJiYgZXhwclZhbHVlICE9PSBleHByT2xkVmFsdWUpO1xufTtcblxuUGFyc2VyLnByb3RvdHlwZS5zZXREaXJ0eUNoZWNrZXIgPSBmdW5jdGlvbiAoZGlydHlDaGVja2VyKSB7XG4gICAgdGhpcy5kaXJ0eUNoZWNrZXIgPSBkaXJ0eUNoZWNrZXI7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IFBhcnNlcjtcbiIsIi8qKlxuICogQGZpbGUg5pyA57uI55qE5qCRXG4gKiBAYXV0aG9yIHlpYnV5aXNoZW5nKHlpYnV5aXNoZW5nQDE2My5jb20pXG4gKi9cblxudmFyIElmRGlyZWN0aXZlUGFyc2VyID0gcmVxdWlyZSgnLi9JZkRpcmVjdGl2ZVBhcnNlcicpO1xudmFyIEV4cHJQYXJzZXIgPSByZXF1aXJlKCcuL0V4cHJQYXJzZXInKTtcbnZhciBGb3JEaXJlY3RpdmVQYXJzZXIgPSByZXF1aXJlKCcuL0ZvckRpcmVjdGl2ZVBhcnNlcicpO1xudmFyIHV0aWxzID0gcmVxdWlyZSgnLi91dGlscycpO1xuXG5mdW5jdGlvbiBUcmVlKG9wdGlvbnMpIHtcbiAgICB0aGlzLnN0YXJ0Tm9kZSA9IG9wdGlvbnMuc3RhcnROb2RlO1xuICAgIHRoaXMuZW5kTm9kZSA9IG9wdGlvbnMuZW5kTm9kZTtcbiAgICB0aGlzLmNvbmZpZyA9IG9wdGlvbnMuY29uZmlnO1xuXG4gICAgdGhpcy50cmVlID0gW107XG59XG5cblRyZWUucHJvdG90eXBlLnRyYXZlcnNlID0gZnVuY3Rpb24gKCkge1xuICAgIHdhbGsodGhpcywgdGhpcy5zdGFydE5vZGUsIHRoaXMuZW5kTm9kZSwgdGhpcy50cmVlKTtcbn07XG5cblRyZWUucHJvdG90eXBlLnNldERhdGEgPSBmdW5jdGlvbiAoZGF0YSkge1xuICAgIGRhdGEgPSBkYXRhIHx8IHt9O1xuICAgIHdhbGtQYXJzZXJzKHRoaXMsIHRoaXMudHJlZSwgZGF0YSk7XG59O1xuXG5UcmVlLnByb3RvdHlwZS5nb0RhcmsgPSBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIGN1ck5vZGUgPSB0aGlzLnN0YXJ0Tm9kZTtcbiAgICBkbyB7XG4gICAgICAgIGlmIChjdXJOb2RlLm5vZGVUeXBlID09PSAxIHx8IGN1ck5vZGUubm9kZVR5cGUgPT09IDMpIHtcbiAgICAgICAgICAgIHV0aWxzLmdvRGFyayhjdXJOb2RlKTtcbiAgICAgICAgfVxuICAgIH0gd2hpbGUgKChjdXJOb2RlID0gY3VyTm9kZS5uZXh0U2libGluZykgJiYgY3VyTm9kZSAhPT0gdGhpcy5lbmROb2RlKTtcbn07XG5cblRyZWUucHJvdG90eXBlLnJlc3RvcmVGcm9tRGFyayA9IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgY3VyTm9kZSA9IHRoaXMuc3RhcnROb2RlO1xuICAgIGRvIHtcbiAgICAgICAgaWYgKGN1ck5vZGUubm9kZVR5cGUgPT09IDEgfHwgY3VyTm9kZS5ub2RlVHlwZSA9PT0gMykge1xuICAgICAgICAgICAgdXRpbHMucmVzdG9yZUZyb21EYXJrKGN1ck5vZGUpO1xuICAgICAgICB9XG4gICAgfSB3aGlsZSAoKGN1ck5vZGUgPSBjdXJOb2RlLm5leHRTaWJsaW5nKSAmJiBjdXJOb2RlICE9PSB0aGlzLmVuZE5vZGUpO1xufTtcblxuVHJlZS5wcm90b3R5cGUuc2V0RGlydHlDaGVja2VyID0gZnVuY3Rpb24gKGRpcnR5Q2hlY2tlcikge1xuICAgIHRoaXMuZGlydHlDaGVja2VyID0gZGlydHlDaGVja2VyO1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSBUcmVlO1xuXG5mdW5jdGlvbiB3YWxrUGFyc2Vycyh0cmVlLCBwYXJzZXJzLCBkYXRhKSB7XG4gICAgZm9yICh2YXIgaSA9IDAsIGlsID0gcGFyc2Vycy5sZW5ndGg7IGkgPCBpbDsgaSsrKSB7XG4gICAgICAgIHZhciBwYXJzZXJPYmogPSBwYXJzZXJzW2ldO1xuICAgICAgICBwYXJzZXJPYmoucGFyc2VyLnNldERpcnR5Q2hlY2tlcih0cmVlLmRpcnR5Q2hlY2tlcik7XG4gICAgICAgIHBhcnNlck9iai5kYXRhID0gdXRpbHMuZXh0ZW5kKHt9LCBwYXJzZXJPYmouZGF0YSB8fCB7fSwgZGF0YSk7XG5cbiAgICAgICAgaWYgKHBhcnNlck9iai5wYXJzZXIgaW5zdGFuY2VvZiBJZkRpcmVjdGl2ZVBhcnNlcikge1xuICAgICAgICAgICAgdmFyIGJyYW5jaEluZGV4ID0gcGFyc2VyT2JqLnBhcnNlci5zZXREYXRhKHBhcnNlck9iai5kYXRhKTtcbiAgICAgICAgICAgIHZhciBicmFuY2hlcyA9IHBhcnNlck9iai5jaGlsZHJlbjtcbiAgICAgICAgICAgIGZvciAodmFyIGogPSAwLCBqbCA9IGJyYW5jaGVzLmxlbmd0aDsgaiA8IGpsOyBqKyspIHtcbiAgICAgICAgICAgICAgICBpZiAoaiA9PT0gYnJhbmNoSW5kZXgpIHtcbiAgICAgICAgICAgICAgICAgICAgd2Fsa1BhcnNlcnModHJlZSwgYnJhbmNoZXNbal0sIHBhcnNlck9iai5kYXRhKTtcbiAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgZm9yICh2YXIgeiA9IDAsIHpsID0gYnJhbmNoZXNbal0ubGVuZ3RoOyB6IDwgemw7IHorKykge1xuICAgICAgICAgICAgICAgICAgICBpZiAoYnJhbmNoZXNbal1bel0ucGFyc2VyIGluc3RhbmNlb2YgRXhwclBhcnNlcikge1xuICAgICAgICAgICAgICAgICAgICAgICAgYnJhbmNoZXNbal1bel0ucGFyc2VyLmdvRGFyaygpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgaWYgKHBhcnNlck9iai5wYXJzZXIgaW5zdGFuY2VvZiBFeHByUGFyc2VyKSB7XG4gICAgICAgICAgICAgICAgcGFyc2VyT2JqLnBhcnNlci5yZXN0b3JlRnJvbURhcmsoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHBhcnNlck9iai5wYXJzZXIuc2V0RGF0YShwYXJzZXJPYmouZGF0YSk7XG4gICAgICAgICAgICBpZiAocGFyc2VyT2JqLmNoaWxkcmVuKSB7XG4gICAgICAgICAgICAgICAgd2Fsa1BhcnNlcnModHJlZSwgcGFyc2VyT2JqLmNoaWxkcmVuLCBwYXJzZXJPYmouZGF0YSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG59XG5cbmZ1bmN0aW9uIHdhbGsodHJlZSwgc3RhcnROb2RlLCBlbmROb2RlLCBjb250YWluZXIpIHtcbiAgICB2YXIgY3VyTm9kZSA9IHN0YXJ0Tm9kZTtcbiAgICBkbyB7XG4gICAgICAgIGlmICghY3VyTm9kZSkge1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoSWZEaXJlY3RpdmVQYXJzZXIuaXNJZk5vZGUoY3VyTm9kZSwgdHJlZS5jb25maWcpKSB7XG4gICAgICAgICAgICB2YXIgaWZFbmROb2RlID0gSWZEaXJlY3RpdmVQYXJzZXIuZmluZElmRW5kKGN1ck5vZGUsIHRyZWUuY29uZmlnKTtcbiAgICAgICAgICAgIGlmICghaWZFbmROb2RlKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCd0aGUgaWYgZGlyZWN0aXZlIGlzIG5vdCBwcm9wZXJseSBlbmRlZCEnKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIGlmRGlyZWN0aXZlUGFyc2VyID0gbmV3IElmRGlyZWN0aXZlUGFyc2VyKHtcbiAgICAgICAgICAgICAgICBzdGFydE5vZGU6IGN1ck5vZGUsXG4gICAgICAgICAgICAgICAgZW5kTm9kZTogaWZFbmROb2RlLFxuICAgICAgICAgICAgICAgIGNvbmZpZzogdHJlZS5jb25maWdcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICB2YXIgYnJhbmNoZXMgPSBpZkRpcmVjdGl2ZVBhcnNlci5jb2xsZWN0RXhwcnMoKTtcbiAgICAgICAgICAgIGNvbnRhaW5lci5wdXNoKHtwYXJzZXI6IGlmRGlyZWN0aXZlUGFyc2VyLCBjaGlsZHJlbjogYnJhbmNoZXN9KTtcbiAgICAgICAgICAgIGZvciAodmFyIGkgPSAwLCBpbCA9IGJyYW5jaGVzLmxlbmd0aDsgaSA8IGlsOyBpKyspIHtcbiAgICAgICAgICAgICAgICBpZiAoIWJyYW5jaGVzW2ldLnN0YXJ0Tm9kZSB8fCAhYnJhbmNoZXNbaV0uZW5kTm9kZSkge1xuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICB2YXIgaWZDb24gPSBbXTtcbiAgICAgICAgICAgICAgICB3YWxrKHRyZWUsIGJyYW5jaGVzW2ldLnN0YXJ0Tm9kZSwgYnJhbmNoZXNbaV0uZW5kTm9kZSwgaWZDb24pO1xuICAgICAgICAgICAgICAgIGJyYW5jaGVzW2ldID0gaWZDb247XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGN1ck5vZGUgPSBpZkVuZE5vZGUubmV4dFNpYmxpbmc7XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChGb3JEaXJlY3RpdmVQYXJzZXIuaXNGb3JOb2RlKGN1ck5vZGUsIHRyZWUuY29uZmlnKSkge1xuICAgICAgICAgICAgdmFyIGZvckVuZE5vZGUgPSBGb3JEaXJlY3RpdmVQYXJzZXIuZmluZEZvckVuZChjdXJOb2RlLCB0cmVlLmNvbmZpZyk7XG4gICAgICAgICAgICBpZiAoIWZvckVuZE5vZGUpIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ3RoZSBmb3IgZGlyZWN0aXZlIGlzIG5vdCBwcm9wZXJseSBlbmRlZCEnKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIGZvckRpcmVjdGl2ZVBhcnNlciA9IG5ldyBGb3JEaXJlY3RpdmVQYXJzZXIoe1xuICAgICAgICAgICAgICAgIHN0YXJ0Tm9kZTogY3VyTm9kZSxcbiAgICAgICAgICAgICAgICBlbmROb2RlOiBmb3JFbmROb2RlLFxuICAgICAgICAgICAgICAgIGNvbmZpZzogdHJlZS5jb25maWcsXG4gICAgICAgICAgICAgICAgVHJlZTogVHJlZVxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIGZvckRpcmVjdGl2ZVBhcnNlci5jb2xsZWN0RXhwcnMoKTtcbiAgICAgICAgICAgIGNvbnRhaW5lci5wdXNoKHtwYXJzZXI6IGZvckRpcmVjdGl2ZVBhcnNlcn0pO1xuXG4gICAgICAgICAgICBjdXJOb2RlID0gZm9yRW5kTm9kZS5uZXh0U2libGluZztcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdmFyIGV4cHJQYXJzZXIgPSBuZXcgRXhwclBhcnNlcih7XG4gICAgICAgICAgICAgICAgbm9kZTogY3VyTm9kZSxcbiAgICAgICAgICAgICAgICBjb25maWc6IHRyZWUuY29uZmlnXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIGV4cHJQYXJzZXIuY29sbGVjdEV4cHJzKCk7XG5cbiAgICAgICAgICAgIHZhciBjb24gPSBbXTtcbiAgICAgICAgICAgIGNvbnRhaW5lci5wdXNoKHtwYXJzZXI6IGV4cHJQYXJzZXIsIGNoaWxkcmVuOiBjb259KTtcbiAgICAgICAgICAgIGlmIChjdXJOb2RlLm5vZGVUeXBlID09PSAxKSB7XG4gICAgICAgICAgICAgICAgd2Fsayh0cmVlLCBjdXJOb2RlLmZpcnN0Q2hpbGQsIGN1ck5vZGUubGFzdENoaWxkLCBjb24pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgY3VyTm9kZSA9IGN1ck5vZGUubmV4dFNpYmxpbmc7XG4gICAgfSB3aGlsZSAoY3VyTm9kZSAhPT0gZW5kTm9kZSk7XG59XG5cblxuXG4iLCJmdW5jdGlvbiBpbmhlcml0KENoaWxkQ2xhc3MsIFBhcmVudENsYXNzKSB7XG4gICAgdmFyIGNoaWxkUHJvdG8gPSBDaGlsZENsYXNzLnByb3RvdHlwZTtcbiAgICBDaGlsZENsYXNzLnByb3RvdHlwZSA9IG5ldyBQYXJlbnRDbGFzcygpO1xuICAgIGZvciAodmFyIGtleSBpbiBjaGlsZFByb3RvKSB7XG4gICAgICAgIGlmIChjaGlsZFByb3RvLmhhc093blByb3BlcnR5KGtleSkpIHtcbiAgICAgICAgICAgIENoaWxkQ2xhc3MucHJvdG90eXBlW2tleV0gPSBjaGlsZFByb3RvW2tleV07XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIENoaWxkQ2xhc3M7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gaW5oZXJpdDsiLCJleHBvcnRzLnNsaWNlID0gZnVuY3Rpb24gKGFyciwgc3RhcnQsIGVuZCkge1xuICAgIHJldHVybiBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcnIsIHN0YXJ0LCBlbmQpO1xufTtcblxuLyoqXG4gKiDorqHnrpfooajovr7lvI/nmoTlgLxcbiAqXG4gKiBAaW5uZXJcbiAqIEBwYXJhbSAge3N0cmluZ30gZXhwcmVzc2lvbiDooajovr7lvI/lrZfnrKbkuLLvvIznsbvkvLzkuo4gYCR7bmFtZX1gIOS4reeahCBuYW1lXG4gKiBAcGFyYW0gIHtPYmplY3R9IGN1ckRhdGEgICAg5b2T5YmN6KGo6L6+5byP5a+55bqU55qE5pWw5o2uXG4gKiBAcmV0dXJuIHtzdHJpbmd9ICAgICAgICAgICAg6K6h566X57uT5p6cXG4gKi9cbmV4cG9ydHMuY2FsY3VsYXRlRXhwcmVzc2lvbiA9IGZ1bmN0aW9uIChleHByZXNzaW9uLCBjdXJEYXRhKSB7XG4gICAgdmFyIHBhcmFtcyA9IGdldFZhcmlhYmxlTmFtZXNGcm9tRXhwcihleHByZXNzaW9uKTtcblxuICAgIHZhciBmbkFyZ3MgPSBbXTtcbiAgICBmb3IgKHZhciBpID0gMCwgaWwgPSBwYXJhbXMubGVuZ3RoOyBpIDwgaWw7IGkrKykge1xuICAgICAgICB2YXIgcGFyYW0gPSBwYXJhbXNbaV07XG4gICAgICAgIHZhciB2YWx1ZSA9IGN1ckRhdGFbcGFyYW1dO1xuICAgICAgICBmbkFyZ3MucHVzaCh2YWx1ZSA9PT0gdW5kZWZpbmVkID8gJycgOiB2YWx1ZSk7XG4gICAgfVxuXG4gICAgdmFyIHJlc3VsdDtcbiAgICB0cnkge1xuICAgICAgICByZXN1bHQgPSAobmV3IEZ1bmN0aW9uKHBhcmFtcywgJ3JldHVybiAnICsgZXhwcmVzc2lvbikpLmFwcGx5KG51bGwsIGZuQXJncyk7XG4gICAgfVxuICAgIGNhdGNoIChlKSB7XG4gICAgICAgIHJlc3VsdCA9ICcnO1xuICAgIH1cblxuICAgIHJldHVybiByZXN1bHQ7XG59O1xuXG5leHBvcnRzLmdvRGFyayA9IGZ1bmN0aW9uIChub2RlKSB7XG4gICAgaWYgKG5vZGUubm9kZVR5cGUgPT09IDEpIHtcbiAgICAgICAgbm9kZS5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuICAgIH1cbiAgICBlbHNlIGlmIChub2RlLm5vZGVUeXBlID09PSAzKSB7XG4gICAgICAgIG5vZGUuX190ZXh0X18gPSBub2RlLm5vZGVWYWx1ZTtcbiAgICAgICAgbm9kZS5ub2RlVmFsdWUgPSAnJztcbiAgICB9XG59O1xuXG5leHBvcnRzLnJlc3RvcmVGcm9tRGFyayA9IGZ1bmN0aW9uIChub2RlKSB7XG4gICAgaWYgKG5vZGUubm9kZVR5cGUgPT09IDEpIHtcbiAgICAgICAgbm9kZS5zdHlsZS5kaXNwbGF5ID0gbnVsbDtcbiAgICB9XG4gICAgZWxzZSBpZiAobm9kZS5ub2RlVHlwZSA9PT0gMykge1xuICAgICAgICBpZiAobm9kZS5fX3RleHRfXyAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICBub2RlLm5vZGVWYWx1ZSA9IG5vZGUuX190ZXh0X187XG4gICAgICAgICAgICBub2RlLl9fdGV4dF9fID0gdW5kZWZpbmVkO1xuICAgICAgICB9XG4gICAgfVxufTtcblxuZXhwb3J0cy5jcmVhdGVFeHByRm4gPSBmdW5jdGlvbiAoZXhwclJlZ0V4cCwgZXhwcikge1xuICAgIGV4cHIgPSBleHByLnJlcGxhY2UoZXhwclJlZ0V4cCwgZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gYXJndW1lbnRzWzFdO1xuICAgIH0pO1xuXG4gICAgcmV0dXJuIGZ1bmN0aW9uIChkYXRhKSB7XG4gICAgICAgIHJldHVybiBleHBvcnRzLmNhbGN1bGF0ZUV4cHJlc3Npb24oZXhwciwgZGF0YSk7XG4gICAgfTtcbn07XG5cbi8qKlxuICog6LaF57qn566A5Y2V55qEIGV4dGVuZCDvvIzlm6DkuLrmnKzlupPlr7kgZXh0ZW5kIOayoemCo+mrmOeahOimgeaxgu+8jFxuICog562J5Yiw5pyJ6KaB5rGC55qE5pe25YCZ5YaN5a6M5ZaE44CCXG4gKlxuICogQGlubmVyXG4gKiBAcGFyYW0gIHtPYmplY3R9IHRhcmdldCDnm67moIflr7nosaFcbiAqIEByZXR1cm4ge09iamVjdH0gICAgICAgIOacgOe7iOWQiOW5tuWQjueahOWvueixoVxuICovXG5leHBvcnRzLmV4dGVuZCA9IGZ1bmN0aW9uICh0YXJnZXQpIHtcbiAgICB2YXIgc3JjcyA9IGV4cG9ydHMuc2xpY2UoYXJndW1lbnRzLCAxKTtcbiAgICBmb3IgKHZhciBpID0gMCwgaWwgPSBzcmNzLmxlbmd0aDsgaSA8IGlsOyBpKyspIHtcbiAgICAgICAgZm9yICh2YXIga2V5IGluIHNyY3NbaV0pIHtcbiAgICAgICAgICAgIHRhcmdldFtrZXldID0gc3Jjc1tpXVtrZXldO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiB0YXJnZXQ7XG59O1xuXG5leHBvcnRzLnRyYXZlcnNlTm9kZXMgPSBmdW5jdGlvbiAoc3RhcnROb2RlLCBlbmROb2RlLCBub2RlRm4sIGNvbnRleHQpIHtcbiAgICB2YXIgbm9kZXMgPSBbXTtcbiAgICBmb3IgKHZhciBjdXJOb2RlID0gc3RhcnROb2RlO1xuICAgICAgICBjdXJOb2RlICYmIGN1ck5vZGUgIT09IGVuZE5vZGU7XG4gICAgICAgIGN1ck5vZGUgPSBjdXJOb2RlLm5leHRTaWJsaW5nXG4gICAgKSB7XG4gICAgICAgIG5vZGVzLnB1c2goY3VyTm9kZSk7XG4gICAgfVxuXG4gICAgbm9kZXMucHVzaChlbmROb2RlKTtcblxuICAgIGV4cG9ydHMuZWFjaChub2Rlcywgbm9kZUZuLCBjb250ZXh0KTtcbn07XG5cbmV4cG9ydHMuZWFjaCA9IGZ1bmN0aW9uIChhcnIsIGZuLCBjb250ZXh0KSB7XG4gICAgaWYgKGV4cG9ydHMuaXNBcnJheShhcnIpKSB7XG4gICAgICAgIGZvciAodmFyIGkgPSAwLCBpbCA9IGFyci5sZW5ndGg7IGkgPCBpbDsgaSsrKSB7XG4gICAgICAgICAgICBpZiAoZm4uY2FsbChjb250ZXh0LCBhcnJbaV0sIGksIGFycikpIHtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICBlbHNlIGlmICh0eXBlb2YgYXJyID09PSAnb2JqZWN0Jykge1xuICAgICAgICBmb3IgKHZhciBrIGluIGFycikge1xuICAgICAgICAgICAgaWYgKGZuLmNhbGwoY29udGV4dCwgYXJyW2tdLCBrLCBhcnIpKSB7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG59O1xuXG5leHBvcnRzLmlzQXJyYXkgPSBmdW5jdGlvbiAoYXJyKSB7XG4gICAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChhcnIpID09PSAnb2JqZWN0IEFycmF5Jztcbn07XG5cbi8qKlxuICog5LuO6KGo6L6+5byP5Lit5oq956a75Ye65Y+Y6YeP5ZCNXG4gKlxuICogQGlubmVyXG4gKiBAcGFyYW0gIHtzdHJpbmd9IGV4cHIg6KGo6L6+5byP5a2X56ym5Liy77yM57G75Ly85LqOIGAke25hbWV9YCDkuK3nmoQgbmFtZVxuICogQHJldHVybiB7QXJyYXkuPHN0cmluZz59ICAgICAg5Y+Y6YeP5ZCN5pWw57uEXG4gKi9cbnZhciBleHByTmFtZU1hcCA9IHt9O1xudmFyIGV4cHJOYW1lUmVnRXhwID0gL1xcLj9cXCQ/KFthLXp8QS1aXSt8KFthLXp8QS1aXStbMC05XStbYS16fEEtWl0qKSkvZztcbmZ1bmN0aW9uIGdldFZhcmlhYmxlTmFtZXNGcm9tRXhwcihleHByKSB7XG4gICAgaWYgKGV4cHJOYW1lTWFwW2V4cHJdKSB7XG4gICAgICAgIHJldHVybiBleHByTmFtZU1hcFtleHByXTtcbiAgICB9XG5cbiAgICB2YXIgbWF0Y2hlcyA9IGV4cHIubWF0Y2goZXhwck5hbWVSZWdFeHApIHx8IFtdO1xuICAgIHZhciBuYW1lcyA9IFtdO1xuICAgIGZvciAodmFyIGkgPSAwLCBpbCA9IG1hdGNoZXMubGVuZ3RoOyBpIDwgaWw7IGkrKykge1xuICAgICAgICBpZiAobWF0Y2hlc1tpXSAmJiBtYXRjaGVzW2ldWzBdICE9PSAnLicpIHtcbiAgICAgICAgICAgIG5hbWVzLnB1c2gobWF0Y2hlc1tpXSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBleHByTmFtZU1hcFtleHByXSA9IG5hbWVzO1xuXG4gICAgcmV0dXJuIG5hbWVzO1xufVxuIiwid2luZG93LlRyZWUgPSBtb2R1bGUuZXhwb3J0cyA9IHJlcXVpcmUoJy4uL3NyYy9UcmVlLmpzJyk7Il19