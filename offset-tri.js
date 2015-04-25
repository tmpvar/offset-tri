var fc = require('fc');
var center = require('ctx-translate-center');
var poly = require('ctx-render-polyline');
var points = require('ctx-render-points');
var bounds2 = require('2d-bounds');
var gridlines = require('ctx-render-grid-lines');
var isect = require('robust-segment-intersect');
var createSDF = require('sdf-polygon-2d');
var area = require('2d-polygon-area');

var TAU = Math.PI*2;
var min = Math.min;
var max = Math.max;

// var polyline = [
//   [-100, -100],
//   [-100, 100],
//   [100, 0],
// ];
var polyline = [[-100,-100],[-100,100],[-255,-142]];


var t1 = [0, 0];
var t2 = [0, 0];
var t3 = [0, 0];
var t4 = [0, 0];
function segseg(a, b, c, d, e, f, g, h) {
  t1[0] = a;
  t1[1] = b;

  t2[0] = c;
  t2[1] = d;

  t3[0] = e;
  t3[1] = f;

  t4[0] = g;
  t4[1] = h;

  return isect(t1, t2, t3, t4);
}

function segbounds (start, end, minx, miny, maxx, maxy) {
  return segseg(start[0], start[1], end[0], end[1], minx, miny, minx, maxy) ||
         segseg(start[0], start[1], end[0], end[1], minx, miny, maxx, miny) ||
         segseg(start[0], start[1], end[0], end[1], maxx, miny, maxx, maxy) ||
         segseg(start[0], start[1], end[0], end[1], minx, maxy, maxx, maxy);
}

function pointinbox(point, minx, miny, maxx, maxy) {
  var x = point[0];
  var y = point[1];
  return x >= minx && x <= maxx && y >= miny && y <= maxy;
}

function gridfill(ctx, r, minx, miny, maxx, maxy) {
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

  for (var x = lx; x < ux; x+=r) {
    for (var y = ly; y < uy; y+=r) {
      var oy = min(r - offset2, uy - y);
      var ox = min(r - offset2, ux - x);
      var dist = sdf(x + r2, y + r2);

      // TODO: test all 4 corners and see if an edge
      //       goes through this box.  If so, split the edge (how?)
      //       and continue on..

      // [[x, y], [x+r, y], [x+r, y+r], [x, y+r]].forEach(function(point) {
      //   if (point[0] > maxx || point[1] > maxy || point[0] < minx || point[1] < miny) {
      //     return;
      //   }


      //   ctx.beginPath();
      //    ctx.moveTo(point[0], point[1]);
      //    ctx.arc(point[0], point[1], 1, 0, Math.PI*2, false)
      //    var d = sdf(point[0], point[1])

      //    if (d > 0) {
      //     ctx.fillStyle = "red";
      //    } else if (d < 0) {
      //     ctx.fillStyle = "green";
      //    }

      //    ctx.fill();
      // })



      var color;
      if (Math.abs(dist) <= r) {
        color = border;
      } else if (dist < 0) {
        color = inside;
      } else {
        color = outside;
      }

      ctx.fillStyle = color;
      ctx.fillRect(x+offset, y+offset, ox, oy);
    }
  }
}


var r = 40;
var b = [0, 0, 0, 0];
var ctx = fc(function() {
  ctx.clear();
  center(ctx);

  bounds2(polyline, b);
  console.log('before', b)
  b[0] = Math.floor(b[0]/r) * r;
  b[1] = Math.floor(b[1]/r) * r;
  b[2] = Math.ceil(b[2]/r) * r;
  b[3] = Math.ceil(b[3]/r) * r;
  console.log('after', b);
  var gridspacing = r;
  ctx.beginPath();
    gridlines(ctx, gridspacing, b[0], b[1], b[2], b[3]);
    ctx.strokeStyle = "rgba(222, 228, 244, .1)";
    ctx.stroke();

  ctx.strokeStyle = "grey";
  ctx.strokeRect(b[0], b[1], Math.ceil(b[2] - b[0]) + 1, Math.ceil(b[3] - b[1]) + 1) ;

  gridfill(ctx, gridspacing, b[0], b[1], b[2], b[3]);

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
