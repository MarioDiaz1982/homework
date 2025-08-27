// Definición de funciones
export function sumar(a, b) {
    if (typeof a !== 'number' || typeof b !== 'number') {
        return NaN;
    }
    return a + b;
}


function esPar(num) {
    return num % 2 === 0;
}

// Ejecución para mostrar en consola
console.log("Resultado de sumar(2, 3):", sumar(2, 3));
console.log("¿4 es par?:", esPar(4));
console.log("¿5 es par?:", esPar(5));
