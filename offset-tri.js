var fc = require('fc');
var center = require('ctx-translate-center');
var poly = require('ctx-render-polyline');
var points = require('ctx-render-points');
var circle = require('ctx-circle');
var bounds2 = require('2d-bounds');
var gridlines = require('ctx-render-grid-lines');
var isect = require('robust-segment-intersect');
var createSDF = require('sdf-polygon-2d');
var area = require('2d-polygon-area');
var segseg = require('segseg');
var sign = require('signum');

var TAU = Math.PI*2;
var min = Math.min;
var max = Math.max;
var abs = Math.abs;
var polyline = [
  [
    -10,
    -100
  ],
  [
    -100,
    -100
  ],
  [
    -100,
    -10
  ],
  [
    -148,
    -23
  ],
  [
    0,
    0
  ],
  [
    100,
    0
  ]
];

//var polyline = [[-10,-100],[-100,-100]]//,[-112,162],[-148,-23],[0,0],[91,28]];

window.dump = function() {
  console.log(JSON.stringify(polyline, null, '  '))
}

function pointinbox(point, minx, miny, maxx, maxy) {
  var x = point[0];
  var y = point[1];
  return x >= minx && x <= maxx && y >= miny && y <= maxy;
}

function line(ctx, x1, y1, x2, y2, color) {
  ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = color || "grey"
    ctx.stroke();
}

function findCrossing(c, n) {

  /*
      c     o
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



  var d0 = c[2] - r;
  var d1 = n[2] - r;
  if (Math.abs(d0) < EPS) {
    return c;
  }

  if (Math.abs(d1) < EPS) {
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
  var length = Math.max(d0, d1) - Math.min(d0, d1);
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

  // always choose `c` for the inteval stuffs
  var ratio = d0 / length;

  // vertical: both `x`s are the same
  if (n[0] === c[0]) {
    var edgeLength = Math.max(c[1], n[1]) - Math.min(c[1], n[1]);
    var amt = edgeLength * ratio;
    if (sign(c[1]) === sign(amt)) {
      ret[1] = c[1] - amt;
    } else {
      ret[1] = c[1] + amt;
    }
    ret[0] = c[0];

  // horizontal: both `y`s are the same
  } else if (n[1] === c[1]) {
    var edgeLength = Math.max(c[0], n[0]) - Math.min(c[0], n[0]);
    var amt = edgeLength * ratio;
    if (sign(c[0]) === sign(amt)) {
      ret[0] = c[0] - amt;
    } else {
      ret[0] = c[0] + amt;
    }
    ret[1] = c[1];
  } else {
    debugger
    // ret[0] = c[0] - ret[0] * ratio;
    // ret[1] = c[1] - ret[1] * ratio;
  }

  if (isNaN(ret[0]) || isNaN(ret[1])) {
    throw new Error('nan')
  }

  return ret;
}

function bisect(a, b) {
  return [(a[0] + b[0])/2, (a[1] + b[1])/2];
}

function closest(p, c, target) {

  var pd = Math.abs(p-target);
  var cd = Math.abs(c-target);

  return pd < cd ? 1 : 0;
}

var EPS = .000001;
function near(a, b) {
  return Math.abs(a-b) < EPS;
}

function vecNear(a, b) {
  return near(a[0], b[0]) && near(a[1], b[1]);
}


function gridfill(ctx, r, minx, miny, maxx, maxy, results) {
  var lx = min(minx, maxx);
  var ly = min(miny, maxy);
  var ux = max(minx, maxx);
  var uy = max(miny, maxy);

  var offset = 1;
  var offset2 = offset * 2
  var inside = 'hsla(114, 19%, 25%, 1)';
  var border = 'hsla(228, 19%, 25%, 1)';
  var outside = 'hsla(0, 19%, 25%, .7)';
  var sdf = createSDF([polyline])
  var block = [0, 0];
  var r2 = (r/2)|0;

  var contour = [];
  // a map of x,y => [index]
  var map = {}

  for (var x = lx; x < ux; x+=r) {
    for (var y = ly; y < uy; y+=r) {
      var oy = min(r - offset2, uy - y);
      var ox = min(r - offset2, ux - x);
      var dist = sdf(x + r2, y + r2);

      // TODO: test all 4 corners and see if an edge
      //       goes through this box.  If so, split the edge (how?)
      //       and continue on..

      var res = [false, false, false, false];

      /*
        test the corners of the box for zero crossings
            0
        0-------1
        |       |
      3 |   X   | 1
        |       |
        3-------2
            2

      # 2 crossings

      +           +
        o-------o
        |       |
      a *   X   |
        |\      |
        o-*-----o
      -   b       +

      from `a` get other crossings
        if only 1 other:
          construct segment from `a` to `b`

      # 4 crossings

      +       c   -
        o-----*-o
        *     | |
      a |\  + |-|
        |-\   | |
        o--*--*-o
      +   b   d   -

      from `a` get other crossings
        if length > 1:

          find the midpoint between points that has the same sign
            sdf(findCrossing(a, b))
            sdf(findCrossing(a, c))
            sdf(findCrossing(a, d))
          construct segment from `a` to `b`


      TODO: store a structure containing the zero crossings of each edge


      */


      var tests = [[x, y], [x+r, y], [x+r, y+r], [x, y+r]];

      // helps define an edge below
      var potentialCrossings = [
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 0],
      ];

      var distances = tests.map(function(a) {
        return sdf(a[0], a[1]);
      });


      var crossings = potentialCrossings.map(function(t) {
        var d0 = distances[t[0]] - r;
        var d1 = distances[t[1]] - r;

        if (sign(d0) !== sign(d1)) {
          return true;
        } else {
          if (!d0 && !d1) {
            return true;
          }
          return false;
        }
      })

      /*

        // Guess
        -   0    +
        L---*----U
            0    +
            L----U

        // bisect
        - 0      +
        L-*------U

        - 0 ++   +
        L-*-UL---U
      */

      crossings.map(function(c, i) {
        if (c) {
          // an edge is (x, y) and the distance to the isosurface @ x,y
          var edge = [[
            tests[potentialCrossings[i][0]][0],
            tests[potentialCrossings[i][0]][1],
            distances[potentialCrossings[i][0]]
          ],
          [
            tests[potentialCrossings[i][1]][0],
            tests[potentialCrossings[i][1]][1],
            distances[potentialCrossings[i][1]]
          ]];


          // bisect the quad edge to find the closest point to zero-crossing
          var ssss = 10, d = c, updateIndex;
          var lastDistance = Infinity;
          var mid = [0, 0];
          var midpointDistance;
          while(ssss--) {
            // bisect the quad current edge
            mid = findCrossing(edge[0], edge[1]);
            midpointDistance = sdf(mid[0], mid[1]);
            mid.push(midpointDistance);

            if (Math.abs(midpointDistance - r) < 1e-6) {
              found = true;
              ctx.beginPath()
                circle(ctx, mid[0], mid[1], 1);
                ctx.strokeStyle = "green";
                ctx.stroke();

              contour.push([mid, x, y, midpointDistance]);
              break;
            }

            /*

              we a guess with it's distance to the isosurface

              +          -
              o------*---o

              then we compute the distance for the new point

              +      -   -
              o------*---o

              find the two points that still contain the crossing

              +      -   -
              o------*---o

              |______|

                these become the new edge




              +      -   -   -   -
              o------o---*---*---*
                  |
                  bisect
            */

            if (sign(midpointDistance - r) !== sign(edge[0][2] - r)) {
              edge[1][0] = mid[0];
              edge[1][1] = mid[1];
              edge[1][2] = mid[2];
            } else if (sign(midpointDistance - r) !== sign(edge[1][2] - r)) {
              edge[0][0] = mid[0];
              edge[0][1] = mid[1];
              edge[0][2] = mid[2];
            } else {
              // potentially all positive or all negative
              debugger;
            }

            // if (sign(midpointDistance) === edge[0][1]) {
            //   edge[1] = mid;
            // } else {
            //   edge[0] = mid;
            // }

            // updateIndex = closest(edge[0][2], edge[1][2], r);
            // edge[updateIndex][0] = mid[0];
            // edge[updateIndex][1] = mid[1];
            // edge[updateIndex][2] = midpointDistance;
          }

          if (ssss <= 0) {
            console.log('ran out of runway', mid[0], mid[1], midpointDistance - r, edge[0][2] - r, edge[1][2] - r);
            // contour.push([mid, x, y, midpointDistance]);
            // contour.push([[edge[0][0], edge[0][1]], x, y, edge[2]]);
            // contour.push([[edge[1][0], edge[1][1]], x, y, edge[2]]);
            // ctx.beginPath()
            //   circle(ctx, mid[0], mid[1], 10);


              ctx.fillStyle = "rgba(255, 123, 54, .25)";
              ctx.fillRect(x+5, y+5, r-10, r-10);
              // ctx.fill();
          }
        }
      })
    }
  }

  var gridpoints = {};

  var points = {};
  // poor man's cache for running point -> cell queries
  contour.forEach(function(point) {
    var gridkey = point[1] + ',' + point[2];
    if (!gridpoints[gridkey]) {
      gridpoints[gridkey] = [];
    }
    var local = gridpoints[gridkey];
    var found = false;
    for (var i = 0; i<local.length; i++) {
      var lp = local[i][0];
      if (vecNear(lp, point[0])) {
        return;
      }
    }

    gridpoints[gridkey].push(point);

    var p = point[0]
    var key = p[0] + ',' + p[1];
    if (!points[key]) {
      points[key] = 1;
    }
  });

  Object.keys(gridpoints).map(function(key) {
    var points = gridpoints[key];

    var l = points.length;
    for (var i = 0; i<l; i++) {
      var ip = points[i];
      var id = ip[3] - r;

      for (var j = 0; j<l; j++) {
        var jp = points[j];
        var jd = jp[3] - r;

        if (j===i) {
          continue;
        }

        /*
           a
        o--*---o
        | /    * c
      b *     /|
        o----*-o
             d

        a-------c

        find the midpoint

        a---o---c

        test distance at o

        0   +   0
        a---o---c   = not connected

        0   0   0
        a---o---c   = connected

        0   -   0
        a---o---c   = not connected

        */


        var mid = bisect(ip[0], jp[0]);
        var midd = sdf(mid[0], mid[1]) - r
        return;
        if (midd <= r/4) {
          line(ctx, jp[0][0], jp[0][1], ip[0][0], ip[0][1]);
          ctx.strokeStyle = "red";
          ctx.stroke();
        } else {
          console.log('nop', midd.toFixed(2));
          ctx.beginPath()
            circle(ctx, mid[0], mid[1], 5);
            ctx.fillStyle = "red"
            ctx.fill();
        }
      }
    }
  });


  // Object.keys(gridpoints).map(function(key) {
  //   var pair = gridpoints[key];
  //   if (pair.length < 2) {
  //     console.log('bail')
  //     return;
  //   }

  //   ctx.beginPath()
  //   ctx.moveTo(pair[0][0][0], pair[0][0][1]);
  //   pair.forEach(function(p, i) {
  //     ctx.lineTo(p[0][0], p[0][1]);
  //   });

  //   ctx.strokeStyle = 'red';
  //   ctx.stroke();
  // })


  // TODO: join end to end these contours

  // poly(ctx, contour);
  // ctx.strokeStyle="green"
  // ctx.stroke();
}


var r = 30;
var b = [0, 0, 0, 0];
var ctx = fc(function() {

  // canvas scene setup
  ctx.clear();
  center(ctx);

  bounds2(polyline, b);

  // compute and draw grid lines
  b[0] = ((Math.floor(b[0]/r) * r) - r*2)|0;
  b[1] = ((Math.floor(b[1]/r) * r) - r*2)|0;
  b[2] = ((Math.ceil(b[2]/r) * r) + r*2)|0;
  b[3] = ((Math.ceil(b[3]/r) * r) + r*2)|0;

  var gridspacing = r;
  ctx.beginPath();
    gridlines(ctx, gridspacing, b[0], b[1], b[2], b[3]);
    ctx.strokeStyle = "rgba(222, 228, 244, .1)";
    ctx.stroke();

  ctx.strokeStyle = "grey";
  var pad = 3;
  ctx.strokeRect(b[0]-pad, b[1]-pad, Math.ceil(b[2] - b[0]) + pad*2, Math.ceil(b[3] - b[1]) + pad*2) ;
  var results = [];
  gridfill(ctx, gridspacing, b[0], b[1], b[2], b[3], results);

  // draw the polygon
  ctx.beginPath();
    poly(ctx, polyline);
  ctx.closePath();
  ctx.strokeStyle = "hsl(17, 80%, 56%)";
  ctx.stroke();

  // draw the polygon points
  ctx.beginPath();
    points(ctx, 3, polyline)
    ctx.fillStyle = "hsl(49, 60%, 56%)";
    ctx.fill();

  if (mouse.dragging || mouse.near) {
    var p = mouse.dragging === false ? mouse.near : mouse.down;
    var sr = 10;

    ctx.beginPath();
      circle(ctx, p[0], p[1], sr);
      ctx.strokeStyle = 'hsl(49, 60%, 56%)';
      ctx.stroke();
  }
  results.forEach(function(seg) {
    if(seg.length < 2) {
      ctx.fillStyle = "red";
      ctx.fillRect(seg[0][2] + r/4, seg[0][3] + r/4, r/2, r/2);


      return;
    }
    ctx.strokeStyle = "green"
    line(ctx, seg[0][0], seg[0][1], seg[1][0], seg[1][1], 'red');

  });
});

var mouse = {
  down: false,
  dragging: false,
  near: false,
  pos: [0, 0]
};

function nearPolyline(mouse, polyline) {
  var m = mouse.pos;
  for (var i=0; i<polyline.length; i++) {
    var p = polyline[i];
    var dx = p[0]-m[0];
    var dy = p[1]-m[1];
    var d = Math.sqrt(dx*dx + dy*dy);

    if (d < min(10, r)) {
      return p;
    }
  }
  return false;
}

document.addEventListener('mousemove', function(ev) {
  mouse.pos[0] = ev.clientX - (ctx.canvas.width/2)|0;
  mouse.pos[1] = ev.clientY - (ctx.canvas.height/2)|0;

  if (mouse.down !== false) {
    if (!mouse.dragging) {
      mouse.dragging = true;
    } else {
      var p = mouse.down;
      p[0] = mouse.pos[0];
      p[1] = mouse.pos[1];
    }
  } else {
    var lastNear = mouse.near;
    mouse.near = nearPolyline(mouse, polyline);
    if (mouse.near && mouse.near !== lastNear) {
      console.log(mouse.near.join(', '))
    }
  }
  ctx.dirty();
});

document.addEventListener('copy', function(e) {
  e.clipboardData.setData('text/plain', JSON.stringify(polyline));
  e.preventDefault();
});

document.addEventListener('mouseup', function(ev) {
  mouse.down = false;
  mouse.dragging = false;
  ctx.dirty();
});

document.addEventListener('mousedown', function(ev) {
  mouse.down = nearPolyline(mouse, polyline);
});
