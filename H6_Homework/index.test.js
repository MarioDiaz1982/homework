// const { expect } = require('chai');

// Import the function to test
// const { sumar } = require('./index');

import { sumar } from './index.js';

describe('sumar', function() {
    it('Function correctly sums two positive integers.', function() {
        expect(sumar(3, 5)).to.equal(8);
    });

    it('Function correctly sums a positive and a negative integer.', function() {
        expect(sumar(7, -2)).to.equal(5);
    });

    it('Function correctly sums two floating-point numbers.', function() {
        expect(sumar(2.5, 3.1)).to.be.closeTo(5.6, 0.0001);
    });

    it('Function returns correct result when both arguments are zero.', function() {
        expect(sumar(0, 0)).to.equal(0);
    });

    it('Function handles non-numeric string inputs gracefully.', function() {
        expect(sumar('a', 'b')).to.be.NaN;
        expect(sumar(1, 'b')).to.be.NaN;
        expect(sumar('a', 2)).to.be.NaN;
    });

    it('Function handles missing arguments without throwing an error.', function() {
        expect(() => sumar(5)).to.not.throw();
        expect(sumar(5)).to.be.NaN;
        expect(() => sumar()).to.not.throw();
        expect(sumar()).to.be.NaN;
    });
});