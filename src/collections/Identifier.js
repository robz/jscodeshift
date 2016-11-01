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

const recast = require('recast');

const types = recast.types.namedTypes;

const filterMethods = {
  /**
   * Returns a function that returns true if the provided path is an identifier
   * of a variable
   *
   * @return {Function}
   */
  isVariable: function() {
    return function (path) {
      const parent = path.parent.node;

      if (
        types.MemberExpression.check(parent) &&
        parent.property === path.node &&
        !parent.computed
      ) {
        // obj.oldName
        return false;
      }

      if (
        types.Property.check(parent) &&
        parent.key === path.node &&
        !parent.computed
      ) {
        // { oldName: 3 }
        return false;
      }

      if (
        types.MethodDefinition.check(parent) &&
        parent.key === path.node &&
        !parent.computed
      ) {
        // class A { oldName() {} }
        return false;
      }

      if (
        types.ObjectTypeProperty.check(parent) &&
        parent.key === path.node
      ) {
        // type t = {oldName: T}
        return false;
      }

      return true;
    };
  },

  isDeclaratorID: function() {
    return function(path) {
      const parent = path.parent.node;

      if (
        parent.id === path.node &&
        (
          // var id = 3;
          types.VariableDeclarator.check(parent) ||
          // function id() {}
          types.FunctionDeclaration.check(parent) ||
          // class id {}
          types.ClassDeclaration.check(parent) ||
          // type id = number
          types.TypeAlias.check(parent)
        )
      ) {
        return true;
      }

      return false;
    };
  },

  /**
   * Returns a function that returns true if the provided path is a variable
   * declared by the specified variable declarator
   *
   * @param {path} path to a variable declarator
   * @return {Function}
   */
  isDeclaredBy: function(varDeclaratorPath) {
    const isVariable = filterMethods.isVariable();
    const name = varDeclaratorPath.node.id.name;

    // sometimes the scope of a var doesn't declare it, so traverse up until we
    // find the "true" scope of the var
    // (see recast issue #188)
    let varDeclaratorScope = varDeclaratorPath.scope;
    while (!varDeclaratorScope.declares(name)) {
      varDeclaratorScope = varDeclaratorScope.parent;
    }

    return function(identPath) {
      if (!isVariable(identPath)) {
        return false;
      }

      let scope = identPath.scope;
      while (!scope.declares(name)) {
        scope = scope.parent;
      }

      if (scope.path === varDeclaratorScope.path) {
        return true;
      }

      return false;
    };
  },
};

exports.filters = filterMethods;
