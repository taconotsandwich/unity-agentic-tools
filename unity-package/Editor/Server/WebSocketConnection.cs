using System;
using System.IO;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading.Tasks;

namespace UnityAgenticTools.Server
{
    public class WebSocketConnection
    {
        private const string WebSocketMagicGuid = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
        private const string RequiredPath = "/unity-agentic";

        private readonly TcpClient _client;
        private readonly NetworkStream _stream;
        private bool _connected;

        public bool IsConnected => _connected && _client.Connected;

        public WebSocketConnection(TcpClient client)
        {
            _client = client;
            _stream = client.GetStream();
            _connected = false;
        }

        public bool PerformHandshake()
        {
            try
            {
                var buffer = new byte[4096];
                int bytesRead = _stream.Read(buffer, 0, buffer.Length);
                if (bytesRead == 0) return false;

                var request = Encoding.UTF8.GetString(buffer, 0, bytesRead);

                var pathMatch = Regex.Match(request, @"^GET\s+(\S+)\s+HTTP");
                if (!pathMatch.Success) return false;

                var requestPath = pathMatch.Groups[1].Value;
                if (requestPath != RequiredPath)
                {
                    SendHttpResponse("404 Not Found", "Invalid path");
                    return false;
                }

                var keyMatch = Regex.Match(request, @"Sec-WebSocket-Key:\s*(\S+)", RegexOptions.IgnoreCase);
                if (!keyMatch.Success)
                {
                    SendHttpResponse("400 Bad Request", "Missing Sec-WebSocket-Key");
                    return false;
                }

                var key = keyMatch.Groups[1].Value;
                var acceptKey = ComputeAcceptKey(key);

                var response = "HTTP/1.1 101 Switching Protocols\r\n" +
                    "Upgrade: websocket\r\n" +
                    "Connection: Upgrade\r\n" +
                    $"Sec-WebSocket-Accept: {acceptKey}\r\n" +
                    "\r\n";

                var responseBytes = Encoding.UTF8.GetBytes(response);
                _stream.Write(responseBytes, 0, responseBytes.Length);
                _stream.Flush();

                _connected = true;
                return true;
            }
            catch
            {
                return false;
            }
        }

        public Task SendAsync(string message)
        {
            if (!IsConnected) return Task.CompletedTask;

            var payload = Encoding.UTF8.GetBytes(message);
            var frame = BuildTextFrame(payload);

            return _stream.WriteAsync(frame, 0, frame.Length)
                .ContinueWith(_ => _stream.Flush());
        }

        public Task<string> ReceiveAsync()
        {
            return Task.Run(() =>
            {
                try
                {
                    return ReadFrame();
                }
                catch
                {
                    _connected = false;
                    return null;
                }
            });
        }

        public void Close()
        {
            if (!_connected) return;
            _connected = false;

            try
            {
                var closeFrame = new byte[] { 0x88, 0x00 };
                _stream.Write(closeFrame, 0, closeFrame.Length);
                _stream.Flush();
            }
            catch { }

            try { _stream.Close(); } catch { }
            try { _client.Close(); } catch { }
        }

        private string ReadFrame()
        {
            var header = new byte[2];
            ReadExact(header, 0, 2);

            var opcode = header[0] & 0x0F;
            var masked = (header[1] & 0x80) != 0;
            var lengthByte = header[1] & 0x7F;

            if (opcode == 0x08)
            {
                _connected = false;
                return null;
            }

            if (opcode == 0x09)
            {
                var pongFrame = new byte[] { 0x8A, 0x00 };
                _stream.Write(pongFrame, 0, pongFrame.Length);
                _stream.Flush();
                return ReadFrame();
            }

            long payloadLength;
            if (lengthByte <= 125)
            {
                payloadLength = lengthByte;
            }
            else if (lengthByte == 126)
            {
                var lenBuf = new byte[2];
                ReadExact(lenBuf, 0, 2);
                payloadLength = (lenBuf[0] << 8) | lenBuf[1];
            }
            else
            {
                var lenBuf = new byte[8];
                ReadExact(lenBuf, 0, 8);
                payloadLength = 0;
                for (int i = 0; i < 8; i++)
                {
                    payloadLength = (payloadLength << 8) | lenBuf[i];
                }
            }

            byte[] maskKey = null;
            if (masked)
            {
                maskKey = new byte[4];
                ReadExact(maskKey, 0, 4);
            }

            var payload = new byte[payloadLength];
            if (payloadLength > 0)
            {
                ReadExact(payload, 0, (int)payloadLength);
            }

            if (masked && maskKey != null)
            {
                for (int i = 0; i < payload.Length; i++)
                {
                    payload[i] ^= maskKey[i % 4];
                }
            }

            if (opcode == 0x01)
            {
                return Encoding.UTF8.GetString(payload);
            }

            return null;
        }

        private void ReadExact(byte[] buffer, int offset, int count)
        {
            int totalRead = 0;
            while (totalRead < count)
            {
                int read = _stream.Read(buffer, offset + totalRead, count - totalRead);
                if (read == 0) throw new IOException("Connection closed");
                totalRead += read;
            }
        }

        private static byte[] BuildTextFrame(byte[] payload)
        {
            using (var ms = new MemoryStream())
            {
                ms.WriteByte(0x81);

                if (payload.Length <= 125)
                {
                    ms.WriteByte((byte)payload.Length);
                }
                else if (payload.Length <= 65535)
                {
                    ms.WriteByte(126);
                    ms.WriteByte((byte)(payload.Length >> 8));
                    ms.WriteByte((byte)(payload.Length & 0xFF));
                }
                else
                {
                    ms.WriteByte(127);
                    var len = (long)payload.Length;
                    for (int i = 7; i >= 0; i--)
                    {
                        ms.WriteByte((byte)((len >> (i * 8)) & 0xFF));
                    }
                }

                ms.Write(payload, 0, payload.Length);
                return ms.ToArray();
            }
        }

        private static string ComputeAcceptKey(string key)
        {
            using (var sha1 = SHA1.Create())
            {
                var combined = key + WebSocketMagicGuid;
                var hash = sha1.ComputeHash(Encoding.UTF8.GetBytes(combined));
                return Convert.ToBase64String(hash);
            }
        }

        private void SendHttpResponse(string status, string body)
        {
            var response = $"HTTP/1.1 {status}\r\nContent-Length: {body.Length}\r\n\r\n{body}";
            var bytes = Encoding.UTF8.GetBytes(response);
            _stream.Write(bytes, 0, bytes.Length);
            _stream.Flush();
        }
    }
}
