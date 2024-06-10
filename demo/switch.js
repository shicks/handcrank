for (const v of [1, 4, 9, 11, 15]) {
  console.log(v);
  switch (v) {
  case 1: console.log('a');
  case 4: console.log('b');
  case 9: console.log('c'); break;
  case 11: console.log('d');
  default: console.log('e');
  }
}
