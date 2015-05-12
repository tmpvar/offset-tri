module.exports = createMouse;


var min = Math.min;
var sqrt = Math.sqrt;

function createMouse(polyline) {

  var mouse = {
    down: false,
    dragging: false,
    near: false,
    pos: [0, 0]
  };

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

  return mouse;
}

function nearPolyline(mouse, polyline) {
  var m = mouse.pos;
  for (var i=0; i<polyline.length; i++) {
    var p = polyline[i];
    var dx = p[0]-m[0];
    var dy = p[1]-m[1];
    var d = sqrt(dx*dx + dy*dy);

    if (d < 10) {
      return p;
    }
  }
  return false;
}
