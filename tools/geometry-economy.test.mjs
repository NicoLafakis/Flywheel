import assert from 'node:assert/strict';
import {CITY_CATALOG,getSortedCityCatalog} from '../js/citycatalog.js';
import {economyLadderViolations} from './validate-campaign.mjs';
const tokyo=CITY_CATALOG.find(c=>c.scene==='tokyo'),count=tokyo.blocks;
const order=getSortedCityCatalog().map(c=>c.scene);
try {
 for(const pieces of [34796,1000,200000]) {
  tokyo.blocks=pieces;
  assert.deepEqual(economyLadderViolations().violations,[],'geometry optimization must not change economic difficulty');
  assert.deepEqual(getSortedCityCatalog().map(c=>c.scene),order,'geometry does not reorder story progression');
  assert.deepEqual([tokyo.coinCount,tokyo.coinValue,tokyo.goalBonus],[160,4,300]);
 }
}finally{tokyo.blocks=count;}
console.log('ALL PASS geometry/economy separation: rewards and progression remain stable');
