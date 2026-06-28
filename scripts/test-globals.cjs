const assert = require('node:assert/strict');

const rootSuites = [];
const suiteStack = [];

function currentSuite() {
  return suiteStack[suiteStack.length - 1] || null;
}

function makeSuite(name) {
  return {
    name,
    beforeEach: [],
    afterEach: [],
    tests: [],
  };
}

function addTest(name, fn) {
  const suite = currentSuite();
  if (!suite) {
    rootSuites.push({
      name,
      beforeEach: [],
      afterEach: [],
      tests: [{ name, fn, beforeEach: [], afterEach: [] }],
    });
    return;
  }

  suite.tests.push({
    name,
    fn,
    beforeEach: suiteStack.flatMap((item) => item.beforeEach),
    afterEach: suiteStack.flatMap((item) => item.afterEach).reverse(),
  });
}

function runSuite(name, fn) {
  const suite = makeSuite(name);
  const parent = currentSuite();
  if (parent) {
    parent.tests.push(suite);
  } else {
    rootSuites.push(suite);
  }

  suiteStack.push(suite);
  try {
    fn();
  } finally {
    suiteStack.pop();
  }
}

async function runTestNode(node, ancestors = []) {
  if (typeof node.fn === 'function') {
    for (const hook of node.beforeEach) {
      await hook();
    }
    await node.fn();
    for (const hook of node.afterEach) {
      await hook();
    }
    return;
  }

  for (const child of node.tests) {
    await runTestNode(child, [...ancestors, node.name]);
  }
}

function makeExpect(actual) {
  const expectation = {
    toBe(expected) {
      assert.equal(actual, expected);
    },
    toEqual(expected) {
      assert.deepEqual(actual, expected);
    },
    toBeTruthy() {
      assert.ok(actual);
    },
    toBeFalsy() {
      assert.ok(!actual);
    },
    toBeLessThan(expected) {
      assert.ok(actual < expected, `${actual} is not less than ${expected}`);
    },
    toBeLessThanOrEqual(expected) {
      assert.ok(actual <= expected, `${actual} is not less than or equal to ${expected}`);
    },
    toBeGreaterThan(expected) {
      assert.ok(actual > expected, `${actual} is not greater than ${expected}`);
    },
    toBeGreaterThanOrEqual(expected) {
      assert.ok(actual >= expected, `${actual} is not greater than or equal to ${expected}`);
    },
    toContain(expected) {
      assert.ok(actual?.includes?.(expected), `${JSON.stringify(actual)} does not contain ${expected}`);
    },
    toHaveLength(expected) {
      assert.equal(actual?.length, expected);
    },
  };

  if (actual && typeof actual.then === 'function') {
    expectation.rejects = {
      async toThrow(expected) {
        await assert.rejects(actual, expected);
      },
    };
    expectation.resolves = {
      async toBe(expected) {
        assert.equal(await actual, expected);
      },
      async toEqual(expected) {
        assert.deepEqual(await actual, expected);
      },
    };
  }

  return expectation;
}

global.describe = runSuite;
global.it = addTest;
global.test = addTest;
global.beforeEach = (fn) => {
  const suite = currentSuite();
  if (!suite) throw new Error('beforeEach() must be called inside describe()');
  suite.beforeEach.push(fn);
};
global.afterEach = (fn) => {
  const suite = currentSuite();
  if (!suite) throw new Error('afterEach() must be called inside describe()');
  suite.afterEach.push(fn);
};
global.expect = makeExpect;

process.once('beforeExit', async () => {
  for (const suite of rootSuites) {
    await runTestNode(suite);
  }
});
