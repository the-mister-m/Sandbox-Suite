# raw websocket: handshake, send close, dump every byte that comes back
import socket, os, base64, json, urllib.request, time

sid = json.load(urllib.request.urlopen("http://127.0.0.1:5000/api/sessions/open"))["list"][0]["id"]
key = base64.b64encode(os.urandom(16)).decode()
s = socket.create_connection(("127.0.0.1", 5000))
s.sendall((f"GET /ws/ade/{sid} HTTP/1.1\r\nHost: 127.0.0.1:5000\r\nUpgrade: websocket\r\n"
           f"Connection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n").encode())
s.settimeout(2)
buf = b""
while b"\r\n\r\n" not in buf:
    buf += s.recv(4096)
print("handshake:", buf.split(b"\r\n")[0])
time.sleep(1.5)  # let the server's init frames land
try:
    while True:
        d = s.recv(65536)
        if not d: break
except socket.timeout:
    pass
# masked close frame, code 1000
mask = os.urandom(4)
payload = (1000).to_bytes(2, "big")
frame = bytes([0x88, 0x80 | len(payload)]) + mask + bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
s.sendall(frame)
s.settimeout(3)
after = b""
try:
    while True:
        d = s.recv(65536)
        if not d:
            print("server closed TCP"); break
        after += d
except socket.timeout:
    print("timed out, TCP still open")
print("bytes after our close:", len(after))
print(after[:200])
