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
 * @protectedß
 * @param {Object} options 来自于构造函数
 */
Parser.prototype.initialize = function (options) {
    this.exprCalculater = options.exprCalculater;
    this.config = options.config;
    this.domUpdater = options.domUpdater;
    this.tree = options.tree;
};

Parser.prototype.initTree = function (tree) {};

Parser.prototype.setScope = function (scopeModel) {
    this.scopeModel = scopeModel;

    this.scopeModel.on('change', this.onChange, this);
    this.scopeModel.on('parentchange', this.onChange, this);
};

Parser.prototype.onChange = function () {
    this.domUpdater.execute();
};

Parser.prototype.getScope = function () {
    return this.scopeModel;
};

Parser.prototype.setData = function (data) {
    this.scopeModel.set(data);
};

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

/**
 * 销毁解析器，将界面恢复成原样
 */
Parser.prototype.destroy = function () {
    this.exprCalculater = null;
    this.config = null;
    this.domUpdater = null;
    this.tree = null;
    this.dirtyChecker = null;
};

module.exports = Parser;
