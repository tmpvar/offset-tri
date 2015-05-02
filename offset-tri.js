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

function midpoint(c, n) {
  var d0 = c[2] - r;
  var d1 = n[2] - r;
  if (Math.abs(d0) < EPS) {
    return c;
  }

  if (Math.abs(d1) < EPS) {
    return n;
  }

  var ret = [
    c[0] - n[0],
    c[1] - n[1]
  ];

  var ratio = d0/(d0-d1);
  ret[0] = c[0] - ret[0] * ratio;
  ret[1] = c[1] - ret[1] * ratio;

  if (isNaN(ret[0]) || isNaN(ret[1])) {
    throw new Error('nan')
  }

  return ret;
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
            sdf(midpoint(a, b))
            sdf(midpoint(a, c))
            sdf(midpoint(a, d))
          construct segment from `a` to `b`


      TODO: store a structure containing the zero crossings of each edge


      */


      var tests = [[x, y], [x+r, y], [x+r, y+r], [x, y+r]];
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

      crossings.map(function(c, i) {
        if (c) {
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
          var ssss = 100, d = c, updateIndex;
          var lastDistance = Infinity;
          var mid;
          var midpointDistance;
          while(ssss--) {
            // bisect the quad current edge
            mid = midpoint(edge[0], edge[1]);
            midpointDistance = sdf(mid[0], mid[1]);
            mid.push(midpointDistance);

            if (Math.abs(midpointDistance - r) < .00001 || midpointDistance >= lastDistance) {
              found = true;
              ctx.beginPath()
                circle(ctx, mid[0], mid[1], 1);
                ctx.strokeStyle = "green";
                ctx.stroke();

              contour.push([mid, x, y, midpointDistance]);
              break;
            }

            updateIndex = closest(edge[0][2], edge[1][2], r);
            edge[updateIndex][0] = mid[0];
            edge[updateIndex][1] = mid[1];
            edge[updateIndex][2] = midpointDistance;
          }

          if (ssss <= 0) {
            console.log('here', Math.abs(midpointDistance - r));
            // contour.push([mid, x, y, midpointDistance]);
            // contour.push([[edge[0][0], edge[0][1]], x, y, edge[2]]);
            // contour.push([[edge[1][0], edge[1][1]], x, y, edge[2]]);
            // ctx.beginPath()
            //   circle(mid[0], mid[1], 10);
            //   ctx.fillStyle = "orange";
            //   ctx.fill();
          }
        }
      })
    }
  }

  var gridpoints = {};

  var points = {};
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

        var mid = midpoint(ip[0], jp[0]);
        var midd = sdf(mid[0], mid[1]) - r
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
  ctx.clear();
  center(ctx);

  bounds2(polyline, b);

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

  ctx.beginPath();
    poly(ctx, polyline);
  ctx.closePath();
  ctx.strokeStyle = "hsl(17, 80%, 56%)";
  ctx.stroke();

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

document.addEventListener('mouseup', function(ev) {
  mouse.down = false;
  mouse.dragging = false;
  ctx.dirty();
});

document.addEventListener('mousedown', function(ev) {
  mouse.down = nearPolyline(mouse, polyline);
});
