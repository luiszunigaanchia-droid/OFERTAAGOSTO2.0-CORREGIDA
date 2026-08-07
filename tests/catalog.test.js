'use strict';

const assert = require('assert');
const Catalog = require('../js/catalog.js');

console.log('--- Ejecutando pruebas unitarias de PreanalyticsCatalog (OFERTAAGOSTO2.0) ---');

// Test 1: normalizeSearch y matchesQuery
const testRecord = {
  id: 'PRU-001',
  nombre: 'Hemograma Completo Automatizado',
  division: 'Hematología',
  tipo_muestra: 'Sangre total con EDTA',
  codigo_digitacion: 'HEM01'
};

assert.strictEqual(Catalog.matchesQuery(testRecord, 'hemograma'), true, 'matchesQuery debe coincidir con nombre');
assert.strictEqual(Catalog.matchesQuery(testRecord, 'edta'), true, 'matchesQuery debe coincidir con tipo de muestra');
assert.strictEqual(Catalog.matchesQuery(testRecord, 'HEM01'), true, 'matchesQuery debe coincidir con código');
assert.strictEqual(Catalog.matchesQuery(testRecord, 'glucosa'), false, 'matchesQuery debe retornar false si no coincide');
console.log('✓ Test 1: matchesQuery y normalizeSearch superado');

// Test 2: divisionName y divisionColor
assert.strictEqual(Catalog.divisionName('Química Clínica'), 'Química Clínica');
assert.strictEqual(Catalog.divisionColor('Hematología'), '#8e4a6b');
console.log('✓ Test 2: divisionName y divisionColor superado');

// Test 3: tubeColor
assert.strictEqual(Catalog.tubeColor('Sangre total con EDTA'), '#6b4fa0');
assert.strictEqual(Catalog.tubeColor('Suero'), '#c0392b');
console.log('✓ Test 3: tubeColor superado');

// Test 4: normalizeTest
const norm = Catalog.normalizeTest({
  id: 101,
  nombre: 'Perfil Lipídico',
  division: 'Química Clínica',
  createdAt: 'fecha-inválida',
  updatedAt: 'fecha-inválida'
});
assert.strictEqual(norm.id, 101);
assert.strictEqual(norm.nombre, 'Perfil Lipídico');
assert.strictEqual(Number.isNaN(Date.parse(norm.createdAt)), false, 'Debe reparar marcas de tiempo inválidas');
console.log('✓ Test 4: normalizeTest superado');

// Test 5: formatTestText
const formatted = Catalog.formatTestText(testRecord);
assert.ok(formatted.includes('PRUEBA: Hemograma Completo Automatizado'));
assert.ok(formatted.includes('División: Hematología'));
console.log('✓ Test 5: formatTestText superado');

// Test 6: protección CSV incluso con espacios iniciales
const csv = Catalog.catalogToCsv([{ ...testRecord, nombre: '  =HYPERLINK("malicioso")' }]);
assert.ok(csv.includes('"\'  =HYPERLINK(""malicioso"")"'), 'Debe neutralizar fórmulas CSV con espacios iniciales');
console.log('✓ Test 6: protección CSV reforzada');

console.log('=== Todas las pruebas de PreanalyticsCatalog pasaron exitosamente (6/6) ===');
