var fc = require('fc');
var center = require('ctx-translate-center');
var poly = require('ctx-render-polyline');
var points = require('ctx-render-points');
var bounds2 = require('2d-bounds');
var gridlines = require('ctx-render-grid-lines');
var isect = require('robust-segment-intersect');

var TAU = Math.PI*2;
var min = Math.min;
var max = Math.max;

var polyline = [
  [-100, -100],
  [-100, 100],
  [100, 0],
];



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
  for (var x = lx; x < ux; x+=r) {
    var wf = false;
    var wo = true;
    var counter = 0;
    var color = outside;
    var lastline = -1;
    for (var y = ly; y < uy; y+=r) {
      var found = false;

      var oy = min(r - offset2, uy - y);
      var ox = min(r - offset2, ux - x);

      /* TODO: the inner fill method here is a bit crazy

          degenerecies
          - the points themselves
          - 2 edges going through the same pixel
          - 1 edge goes through 2+ points on the y
          - 2 edges meeting cause more artifacts

      */

      for (var i = 0; i<polyline.length; i++) {
        var c = polyline[i % polyline.length];
        var n = polyline[(i+1) % polyline.length];

        if (segbounds(c, n, x, y, x+r, y+r)) {
          color = border;
          found = true;
          wf && counter++;
          if (lastline !== i) {
            wo = !wo;
            lastline = i;
          }
          break;
        }
      }

      if (!found && wf) {
        // wo = !wo
        if (wo) {
          color = outside
        } else {
          if (counter > 5) {
            color = outside
          } else {
            color = inside;
          }
        }

        counter = 0;
      } else if (!found && !wf) {
        // wo = true;
      }

      wf = found;

      ctx.fillStyle = color;
      ctx.fillRect(x+offset, y+offset, ox, oy);
    }
  }
}


var r = 10;
var b = [0, 0, 0, 0];
var ctx = fc(function() {
  ctx.clear();
  center(ctx);

  bounds2(polyline, b);
  b[0] -= r;
  b[1] -= r;
  b[2] += r;
  b[3] += r;

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
