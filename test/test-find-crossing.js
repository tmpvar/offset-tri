var test = require('tape');
var findCrossing = require('../find-crossing');
var createSDF = require('sdf-polygon-2d');
var sign = require('signum');


test('sidecase with 30 units radius', function(t) {

  var sdf = createSDF([[[0, 0], [10, 0]]]);

  var r = 30;
  var c = [r, 0];
  c.push(sdf(c) - r);

  var n = [r, -r];
  n.push(sdf(n) - r)

  var sentinal = 10;
  while (sentinal--) {

    var p = findCrossing(c, n, r);
    var d = sdf(p) - r;

    console.log('C', c)
    console.log('N', n)
    console.log('P', p, d)
    t.equal(p[0], 30, 'remains vertical');
    t.ok(p[1] >= 0, 'within lower bounds');
    t.ok(p[1] <= 30, 'within upper bounds');

    if (Math.abs(d) < 1e-5) {
      t.end();
      break;
    }

    if (sign(d) !== sign(c[2])) {
      n[0] = p[0];
      n[1] = p[1];
      n[2] = d;
    } else if (sign(d) !== sign(n[2])) {
      c[0] = p[0];
      c[1] = p[1];
      c[2] = d;
    } else {
      t.fail();
    }
  }


});
