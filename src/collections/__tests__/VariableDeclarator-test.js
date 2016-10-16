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

var babel = require('babel-core');
var recast = require('recast');
var types = recast.types.namedTypes;
var b = recast.types.builders;

describe('VariableDeclarators', function() {
  var nodes;
  var Collection;
  var VariableDeclaratorCollection;
  var jscodeshift;

  beforeEach(function() {
    jest.resetModuleRegistry();

    Collection = require('../../Collection');
    VariableDeclaratorCollection =  require('../VariableDeclarator');
    VariableDeclaratorCollection.register();
    jscodeshift = require('../../core');

    nodes = [recast.parse([
      'var foo = 42;',
      'var bar = require("module");',
      'var baz = require("module2");',
      'function func() {',
      '  var x = bar;',
      '  bar.someMethod();',
      '  func1(bar);',
      '}',
      'function func1(bar) {',
      '  var bar = 21;',
      '}',
      'foo.bar();',
      'foo[bar]();',
      'bar.foo();',
      'function func() {',
      '  var blah;',
      '  var obj = {',
      '    blah: 4,',
      '    blah() {},',
      '  };',
      '  obj.blah = 3;',
      '  class A {',
      '    blah() {}',
      '  }',
      '}',
    ].join('\n'), {parser: babel}).program];
  });

  describe('Traversal', function() {
    it('adds a root method to find variable declarators', function() {
      expect(Collection.fromNodes([]).findVariableDeclarators).toBeDefined();
    });

    it('finds all variable declarators', function() {
      var declarators = Collection.fromNodes(nodes).findVariableDeclarators();
      expect(declarators.getTypes()).toContain('VariableDeclarator');
      expect(declarators.length).toBe(7);
    });

    it('finds variable declarators by name', function() {
      var declarators = Collection.fromNodes(nodes)
        .findVariableDeclarators('bar');
      expect(declarators.length).toBe(2);
    });
  });

  describe('Filters', function() {
    it('finds module imports (require)', function() {
      var declarators = Collection.fromNodes(nodes)
        .findVariableDeclarators()
        .filter(VariableDeclaratorCollection.filters.requiresModule());

      expect(declarators.length).toBe(2);
    });

    it('finds module imports (require) by module name', function() {
      var declarators = Collection.fromNodes(nodes)
        .findVariableDeclarators()
        .filter(VariableDeclaratorCollection.filters.requiresModule('module'));

      expect(declarators.length).toBe(1);
    });

    it('accepts multiple module names', function() {
      var declarators = Collection.fromNodes(nodes)
        .findVariableDeclarators()
        .filter(VariableDeclaratorCollection.filters.requiresModule(
          ['module', 'module2']
        ));

      expect(declarators.length).toBe(2);
    });
  });

  describe('renameTo', function() {
    it('renames variable declarations considering scope', function() {
      var declarators = Collection.fromNodes(nodes)
        .findVariableDeclarators()
        .filter(VariableDeclaratorCollection.filters.requiresModule('module'))
        .renameTo('xyz');

      var identifiers =
        Collection.fromNodes(nodes)
        .find(types.Identifier, {name: 'xyz'});

      expect(identifiers.length).toBe(6);
    });

    it('does not rename things that are not variables', function() {
      var declarators = Collection.fromNodes(nodes)
        .findVariableDeclarators('blah')
        .renameTo('blarg');

      var identifiers =
        Collection.fromNodes(nodes)
        .find(types.Identifier, {name: 'blarg'});

      expect(identifiers.length).toBe(1);
    });
  });

  describe('removeUnreferenced', function() {
    it('deletes unused declarator', () => {
      const input =
`var x = 3, y = 4;
f(y);`;

      const expected =
`var y = 4;
f(y);`;

      expect(
        jscodeshift(input)
          .findVariableDeclarators()
          .removeUnreferenced()
          .toSource()
      ).toEqual(expected);
    });

    it('handles function scope', () => {
      const input =
`function f() {
  var x = 3;
}

function g() {
  var x = 4;
  return x;
}`;

      const expected =
`function f() {}

function g() {
  var x = 4;
  return x;
}`;

      expect(
        jscodeshift(input)
          .findVariableDeclarators()
          .removeUnreferenced()
          .toSource()
      ).toEqual(expected);
    });

    it('handles nested function scope', () => {
      const input =
`var x = 3;

function g() {
  var x = 4;
  return x;
}`;

      const expected =
`function g() {
  var x = 4;
  return x;
}`;

      expect(
        jscodeshift(input)
          .findVariableDeclarators()
          .removeUnreferenced()
          .toSource()
      ).toEqual(expected);
    });

    // this may fail in the future if ast-types issue 154 is fixed
    // if so, delete this test
    it('does not yet handle block scope', () => {
      const input =
`if (a) {
  const x = 3;
} else if (b) {
  let x = 4;
  x += 3;
}`;

      const expected =
`if (a) {
  const x = 3;
} else if (b) {
  let x = 4;
  x += 3;
}`;

      expect(
        jscodeshift(input)
          .findVariableDeclarators()
          .removeUnreferenced()
          .toSource()
      ).toEqual(expected);
    });

    it('only checks actual variables', () => {
      const input =
`var x = 3;

class A { x() {} }

type T = {x: number};

y.x = 5;

function g() {
  var x = 4;
  return {x: 3};
}`;

      const expected =
`class A { x() {} }

type T = {x: number};

y.x = 5;

function g() {
  return {x: 3};
}`;

      expect(
        jscodeshift(input)
          .findVariableDeclarators()
          .removeUnreferenced()
          .toSource()
      ).toEqual(expected);
    });

    it('handles duplicate declarations', () => {
      const input =
`var x = 3;
var x = 4;
function x() {}
type x = number;
class x extends y {}`;

      const expected =
`function x() {}
type x = number;
class x extends y {}`;

      expect(
        jscodeshift(input)
          .findVariableDeclarators()
          .removeUnreferenced()
          .toSource()
      ).toEqual(expected);
    });
  });
});
