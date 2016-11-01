/*
 *  Copyright (c) 2015-present, Facebook, Inc.
 *  All rights reserved.
 *
 *  This source code is licensed under the BSD-style license found in the
 *  LICENSE file in the root directory of this source tree. An additional grant
 *  of patent rights can be found in the PATENTS file in the same directory.
 *
 */

'use strict';

var _ = require('lodash');
var Collection = require('../Collection');
var NodeCollection = require('./Node');
var matchNode = require('../matchNode');
var recast = require('recast');
var IdentifierCollection = require('./Identifier');

var astNodesAreEquivalent = recast.types.astNodesAreEquivalent;
var b = recast.types.builders;
var types = recast.types.namedTypes;

var VariableDeclarator = recast.types.namedTypes.VariableDeclarator;
var Identifier = recast.types.namedTypes.Identifier;

/**
* @mixin
*/
var globalMethods = {
  /**
   * Finds all variable declarators, optionally filtered by name.
   *
   * @param {string} name
   * @return {Collection}
   */
  findVariableDeclarators: function(name) {
    var filter = name ? {id: {name: name}} : null;
    return this.find(VariableDeclarator, filter);
  }
};

var filterMethods = {
  /**
   * Returns a function that returns true if the provided path is a variable
   * declarator and requires one of the specified module names.
   *
   * @param {string|Array} names A module name or an array of module names
   * @return {Function}
   */
  requiresModule: function(names) {
    if (names && !Array.isArray(names)) {
      names = [names];
    }
    var requireIdentifier = b.identifier('require');
    return function(path) {
      var node = path.value;
      if (!VariableDeclarator.check(node) ||
          !types.CallExpression.check(node.init) ||
          !astNodesAreEquivalent(node.init.callee, requireIdentifier)) {
        return false;
      }
      return !names ||
        names.some(
          n => astNodesAreEquivalent(node.init.arguments[0], b.literal(n))
        );
    };
  }
};

/**
* @mixin
*/
var transformMethods = {
  /**
   * Renames a variable and all its occurrences.
   *
   * @param {string} newName
   * @return {Collection}
   */
  renameTo: function(newName) {
    // TODO: Include JSXElements
    return this.forEach(varPath => {
      const oldName = varPath.node.id.name;
      Collection.fromPaths([varPath.scope.path])
        .find(types.Identifier, {name: oldName})
        .filter(IdentifierCollection.filters.isDeclaredBy(varPath))
        .forEach(path => path.get('name').replace(newName));
    });
  },

  /**
   * Removes variable declarators that declare variables which are never
   * referenced.
   *
   * @return {Collection}
   */
  removeUnreferenced: function() {
    return this.filter(varPath => {
      const isDeclaratorID =
        IdentifierCollection.filters.isDeclaratorID(varPath);
      const name = varPath.node.id.name;

      if (!name) {
        // declarations with destructuring assignment will not have ids which
        // are identifiers
        return false;
      }

      return 0 === Collection.fromPaths([varPath.scope.path])
        .find(types.Identifier, {name})
        .filter(path => !isDeclaratorID(path))
        .filter(IdentifierCollection.filters.isDeclaredBy(varPath))
        .size();
    }).remove();
  },
};

function register() {
  NodeCollection.register();
  Collection.registerMethods(globalMethods);
  Collection.registerMethods(transformMethods, VariableDeclarator);
}

exports.register = _.once(register);
exports.filters = filterMethods;
