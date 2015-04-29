var fc = require('fc');
var center = require('ctx-translate-center');
var poly = require('ctx-render-polyline');
var points = require('ctx-render-points');
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
  [-10, -100],
  [-100, -100],
  [-100, -10],
  [-100, 100],
  [0, 0],

  [100, 0],
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
  return [(c[0] + n[0])/2, (c[1] + n[1])/2];
}

function closest(p, c, target) {

  var pd = Math.abs(p-target);
  var cd = Math.abs(c-target);

  return pd < cd ? 1 : 0;
}



// a crossing is a isosurface zero crossing on a gridline
// it is stored in this array as 'x,y' : [start, end]
var crossingMap = {}





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
        test the corners of the box

        0-------1
        |       |
        |       |
        |       |
        3-------2
      */


      var tests = [[x, y], [x+r, y], [x+r, y+r], [x, y+r]];
      var potentialCrossings = [
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 0]
      ];

      var distances = tests.map(function(a) {
        return sdf(a[0], a[1]);
      });


      var crossings = potentialCrossings.map(function(t) {
        if (sign(distances[t[0]] - r) !== sign(distances[t[1]] - r)) {
          return true;
        } else {
          return false;
        }
      })

      // console.log(crossings);


      crossings.map(function(c, i) {
        if (c) {
          var edge = [

            [
              tests[potentialCrossings[i][0]][0],
              tests[potentialCrossings[i][0]][1],
              distances[potentialCrossings[i][0]]
            ],
            [
              tests[potentialCrossings[i][1]][0],
              tests[potentialCrossings[i][1]][1],
              distances[potentialCrossings[i][1]]
            ],
            // tests[potentialCrossings[i][1]].concat()
          ];

          // line(ctx, edge[0][0], edge[0][1], edge[1][0], edge[1][1]);
          // ctx.strokeStyle = "rgba(255, 255, 255, .01)";
          // ctx.stroke();


          // follow the rabbit and bisect the weird interval we've setup
          var ssss = 100, d = c, updateIndex;
          var lastDistance = Infinity;
          var mid;
          while(ssss--) {
            // bisect the current edge
            mid = midpoint(edge[0], edge[1]);
            var midpointDistance = sdf(mid[0], mid[1]);
            if (Math.abs(midpointDistance - r) < .000001 || midpointDistance > lastDistance) {
              found = true;
              ctx.beginPath()
              ctx.arc(mid[0], mid[1], 5, 0, Math.PI*2, false);
              ctx.fillStyle = "green";
              ctx.fill();

              contour.push(mid);
              break;
            }

            updateIndex = closest(edge[0][2], edge[1][2], r);
            edge[updateIndex][0] = mid[0];
            edge[updateIndex][1] = mid[1];
            edge[updateIndex][2] = midpointDistance;
          }
          if (ssss <= 0) {
              ctx.beginPath()
              ctx.arc(mid[0], mid[1], 5, 0, Math.PI*2, false);
              ctx.fillStyle = "green";
              ctx.fill();
          }
        }
      })
    }
  }

  // TODO: join end to end these contours

  poly(ctx, contour);
  ctx.strokeStyle="green"
  ctx.stroke();
}


var r = 60;
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
    ctx.beginPath();
      var p = mouse.dragging === false ? mouse.near : mouse.down;
      var sr = 10;
      ctx.moveTo(p[0] + sr, p[1])
      ctx.arc(p[0], p[1], sr, 0, TAU, false);
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

    // ctx.beginPath();
    //   ctx.moveTo(seg[0][0] + r, seg[0][1]);
    //   ctx.arc(seg[0][0], seg[0][1], r, 0, Math.PI*2, false)
    //   ctx.strokeStyle = '#red';
    //   ctx.stroke();

    // ctx.beginPath();
    //   ctx.moveTo(seg[1][0] + r, seg[1][1]);
    //   ctx.arc(seg[1][0], seg[1][1], r, 0, Math.PI*2, false)
    //   ctx.strokeStyle = 'green';
    //   ctx.stroke();

    // var mid = midpoint(seg[0], seg[1]);
    // ctx.beginPath();
    //   ctx.moveTo(mid[0] + r, mid[1]);
    //   ctx.arc(mid[0], mid[1], r, 0, Math.PI*2, false)
    //   ctx.strokeStyle = 'orange';
    //   ctx.stroke();


  });

  // poly(ctx,);
  // ctx.lineWidth = 10;
  // ctx.strokeStyle = "red";
  // ctx.stroke();
return;
  var chain = results.slice();
  console.log('chain', JSON.stringify(chain, null, '  '))
  chain.sort(function(a, b) {
    return a[0][0] - b[0][0];
  });

  function next(a, b) {
    // TODO: there are some degenerate cases here, I think it's just a matter
    //       of the path not being closed

    // console.log('diffs', Math.abs(a[0][0] - b[0][0]), Math.abs(a[0][1] - b[0][1]), Math.abs(a[1][0] - b[1][0]), Math.abs(a[1][1] - b[1][1]))

    return Math.abs(a[0][0] - b[0][0]) < r ||
           Math.abs(a[0][1] - b[0][1]) < r ||
           Math.abs(a[1][0] - b[1][0]) < r ||
           Math.abs(a[1][1] - b[1][1]) < r
  }

  var last = chain.shift();
  var out = [last];
  var sentinal = results.length*2;
  while(chain.length && sentinal--) {
    var l = chain.length;
    var found = false;
    for (var i=0; i<l; i++) {
      if (next(last, chain[i])) {
        last = chain.splice(i, 1)[0];
        out.push(last);
        break;
      }
    }
  }

  var p = (360/out.length)
  var h = 0;
  out.map(function(link) {
    line(ctx, link[0][0], link[0][1], link[1][0], link[1][1], 'hsla(' + (h+=p) + ', 80%, 50%, .9)');
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
    mouse.near = nearPolyline(mouse, polyline);
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
