import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyBoard,canPlace,hasPlacement,placePiece,SHAPES} from '../src/games/block-bloom.ts';

test('placements reject occupied cells and every out of bounds edge',()=>{
  const board=emptyBoard();board[2][2]=1;
  assert.equal(canPlace(board,SHAPES[5],1,1),false);
  for(const [x,y] of [[-1,0],[0,-1],[7,7],[8,0],[0,8]])assert.equal(canPlace(board,SHAPES[5],x,y),false);
  assert.equal(canPlace(board,SHAPES[5],6,6),true);
});
test('a crossing row and column clear simultaneously without double counting the intersection',()=>{
  const board=emptyBoard();for(let i=0;i<8;i++){board[3][i]=1;board[i][3]=2;}board[3][3]=0;
  const result=placePiece(board,[[0,0]],3,3);
  assert.equal(result.lines,2);assert.equal(result.cleared.length,15);assert.equal(result.board.flat().some(Boolean),false);
  assert.equal(board[3][0],1);assert.equal(board[3][3],0);
});
test('game over considers all remaining pieces and finds edge placements',()=>{
  const board=Array.from({length:8},()=>Array(8).fill(1));board[7][7]=0;
  assert.equal(hasPlacement(board,SHAPES[0]),true);assert.equal(hasPlacement(board,SHAPES[1]),false);assert.equal(hasPlacement(board,null),false);
  board[7][6]=0;assert.equal(hasPlacement(board,SHAPES[1]),true);
});
test('illegal placement never modifies the board',()=>{
  const board=emptyBoard(),snapshot=structuredClone(board);
  assert.equal(placePiece(board,SHAPES[5],7,7),null);assert.deepEqual(board,snapshot);
});
