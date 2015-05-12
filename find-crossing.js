var sign = require('signum');

module.exports = findCrossing;

var abs = Math.abs;
var min = Math.min;
var max = Math.max;

function findCrossing(c, n, delta, epsilon) {
  epsilon = epsilon || 1e-7;

  /*
      |     :
      |     :
      |     :
      |     :  a
      |  b  :
      |     c

      |_____|
         r

      c - r == 0
      b - r == -
      a - r == +
  */

  var d0 = c[2] - delta;
  var d1 = n[2] - delta;
  if (abs(d0) < epsilon) {
    return c;
  }

  if (abs(d1) < epsilon) {
    return n;
  }

  // ret will eventually be [x, y, sdf(x,y)]
  var ret = [0, 0];

  /*

    o  d0 (6)
     \
      \
       \
        o ~~~ isosurface shell (0)
         \
          o d1 (-2)


    THE ANSWER
      length of distance interval: 8
      length of the edge interval: 24
      the zero crossing (0): .25 (from d1)
      the guessed crossing on edge:
        24 * .25 == 6
        24 - 6 == 18

    in 1d!

  d0 (6)              d1 (-2)
    o------------o----o
    +            0    -

                 |____|
                   .25



    length = Math.max(6, -2) - Math.min(6, -2) == 8
    min(6, -2) / (6 - -2)

    ratio (choose one):
    e1) -2 / 8 == -0.25  (min)
    e0)  6 / 8 ==  0.75  (max)
     |
      \
       Numerator defines which side to apply the ratio*edge length


  e0       e1
    o-----o
    0     24

  convert ratio to edge distance
  e1) 24 * -0.25 == -6
  e0) 24 *  0.75 ==  18

  apply distance
  e1) 24 + -6  == 18
  e0)  0 +  18 == 18

  */
  var length = max(d0, d1) - min(d0, d1);
  if (!length) {
    debugger;
    return n;
  }


  /*
    find which orientation this edge is in

    c[0]  n[0]  horizontal edge
    o-----o

    or vertical edge

    o c[1]
    |
    |
    o n[1]
  */

  // always choose `c` for the interval stuffs
  var ratio = d0 / length;
  var amt, edgeLength;
  // vertical: both `x`s are the same
  if (n[0] === c[0]) {
    edgeLength = max(c[1], n[1]) - min(c[1], n[1]);
console.log('length', length)
console.log('edgeLength', edgeLength);
console.log('ratio', ratio);
    if (abs(ratio) < 1) {
      amt = edgeLength * ratio;
    } else {
      amt = edgeLength / ratio;
    }

    if (sign(c[1]) === sign(amt)) {
      ret[1] = c[1] - amt;
    } else {
      ret[1] = c[1] + amt;
    }
    ret[0] = c[0];

  // horizontal: both `y`s are the same
  } else if (n[1] === c[1]) {
    edgeLength = max(c[0], n[0]) - min(c[0], n[0]);
    amt = edgeLength * ratio;
    if (sign(c[0]) === sign(amt)) {
      ret[0] = c[0] - amt;
    } else {
      ret[0] = c[0] + amt;
    }
    ret[1] = c[1];
  } else {
    throw new Error('ended up off of the grid')
  }

  if (isNaN(ret[0]) || isNaN(ret[1])) {
    throw new Error('nan')
  }

  return ret;
}
