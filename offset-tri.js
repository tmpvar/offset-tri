/* jshint asi: true */

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
  // [
  //   0,
  //   0
  // ],
  // [
  //   100,
  //   0
  // ]
];

// var polyline = [[-10,-100],[-100,-100]]//,[-112,162],[-148,-23],[0,0],[91,28]];
// var polyline = [[-10,-100],[-19,-100]]
// var polyline = [[-130,-93],[-19,-100]]
var polyline = [[-10,-100],[-100,-100],[-45,25],[-146,-5]]
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

function findCrossing(c, n, delta) {

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
  var amt, edgeLength;
  // vertical: both `x`s are the same
  if (n[0] === c[0]) {
    edgeLength = Math.max(c[1], n[1]) - Math.min(c[1], n[1]);
    amt = edgeLength * ratio;
    if (sign(c[1]) === sign(amt)) {
      ret[1] = c[1] - amt;
    } else {
      ret[1] = c[1] + amt;
    }
    ret[0] = c[0];

  // horizontal: both `y`s are the same
  } else if (n[1] === c[1]) {
    edgeLength = Math.max(c[0], n[0]) - Math.min(c[0], n[0]);
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


function gridfill(ctx, delta, minx, miny, maxx, maxy, results) {
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

  var contour = [];
  // a map of x,y => [index]
  var map = {}
  var cache = {}
  for (var x = lx; x < ux; x+=delta) {
    for (var y = ly; y < uy; y+=delta) {
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


      var tests = [
        [x, y],
        [x+delta, y],
        [x+delta, y+delta],
        [x, y+delta]
      ];

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
        var d0 = distances[t[0]] - delta;
        var d1 = distances[t[1]] - delta;

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
          var edgea = [
            tests[potentialCrossings[i][0]][0],
            tests[potentialCrossings[i][0]][1],
            distances[potentialCrossings[i][0]]
          ];
          var edgeb = [
            tests[potentialCrossings[i][1]][0],
            tests[potentialCrossings[i][1]][1],
            distances[potentialCrossings[i][1]]
          ];


          var edge;
          if (edgea[2] > 0) {
            edge = [edgea, edgeb]
          } else {
            edge = [edgeb, edgea]
          }


          // bisect the quad edge to find the closest point to zero-crossing
          var ssss = 200, d = c, updateIndex;
          var lastDistance = Infinity;
          var mid = [0, 0];
          var midpointDistance;
          while(ssss--) {
            // bisect the quad current edge
            mid = findCrossing(edge[0], edge[1], delta);
            midpointDistance = sdf(mid[0], mid[1]);

            if (Math.abs(midpointDistance - delta) < 1e-6) {
              found = true;
              ctx.beginPath()
                circle(ctx, mid[0], mid[1], 1);
                ctx.strokeStyle = "green";
                ctx.stroke();

              contour.push([mid, x, y, midpointDistance]);
              break;
            }

            /*

              we make a guess with its distance to the isosurface

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

            var drm = midpointDistance - delta;
            var dr0 = edge[0][2] - delta;
            var dr1 = edge[1][2] - delta;

            if (sign(drm) !== sign(dr0)) {
              updateIndex = 1;
            } else if (sign(drm) !== sign(dr1)) {
              updateIndex = 0;
            } else {
              // potentially all positive or all negative
              debugger;
            }

            edge[updateIndex][0] = mid[0];
            edge[updateIndex][1] = mid[1];
            edge[updateIndex][2] = midpointDistance;

            // if (Math.abs(edge[0][2]) < Math.abs(edge[1][2])) {
            //   var t = edge[0];
            //   edge[0] = edge[1];
            //   edge[1] = t;
            // }
          }

          if (ssss <= 0) {
            console.log('ran out of runway',
              mid[0],
              mid[1],
              midpointDistance - delta,
              edge[0][2] - delta,
              edge[1][2] - delta,
              x,
              y,
              i
            );
            // contour.push([mid, x, y, midpointDistance]);
            // contour.push([[edge[0][0], edge[0][1]], x, y, edge[2]]);
            // contour.push([[edge[1][0], edge[1][1]], x, y, edge[2]]);
            // ctx.beginPath();
            //   ctx.moveTo(oedge[0][0], oedge[0][1]);
            //   ctx.lineTo(oedge[1][0], oedge[1][1]);
            //   ctx.strokeStyle = "red";
            //   ctx.stroke();

            // ctx.beginPath()
            //   circle(ctx, mid[0], mid[1], 5);
            //   ctx.stroke();

            // ctx.fillStyle = "rgba(255, 255, 54, .1)";
            // ctx.fillRect(x+5, y+5, r-10, r-10);
          } else {


            var nx = x;
            var ny = y;

            var ni = (i+2)%4;
            var currentCacheKey = [i, x, y].join(':');
            var oppositeCacheKey =

            cache[currentCacheKey] = contour[contour.length-1];
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

    var p = point[0];
    var key = p[0] + ',' + p[1];
    if (!points[key]) {
      points[key] = 1;
    }
  });

/*  Object.keys(gridpoints).map(function(key) {
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

        * /

        var mid = bisect(ip[0], jp[0]);
        var midd = sdf(mid[0], mid[1]) - r
        // return;
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
  });*/


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

  //   ctx.strokeStyle = '#4F8323';
  //   ctx.stroke();
  // })


  // TODO: join end to end these contours

  // poly(ctx, contour);
  // ctx.strokeStyle="green"
  // ctx.stroke();
}


var r = 30;
var b = [0, 0, 0, 0];
var ctx = window.ctx = fc(function() {

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


  // draw the polygon with the proper radius (minkowski sum)
  ctx.save()
    ctx.lineWidth = r*2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.beginPath();

      poly(ctx, polyline);
      ctx.lineTo(polyline[0][0], polyline[0][1])
      ctx.moveTo(0, 0)
    ctx.closePath();

    ctx.strokeStyle = "rgba(0, 0, 0, .5)";
    ctx.stroke();
  ctx.restore();



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
