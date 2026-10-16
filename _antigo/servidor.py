"""Servidor local do Hangar DCS.  Rode com:  python servidor.py   (ou dê dois cliques no iniciar.bat)"""
import http.server
import os
import sys
import threading
import webbrowser

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
os.chdir(os.path.dirname(os.path.abspath(__file__)))


class Handler(http.server.SimpleHTTPRequestHandler):
    # O Windows às vezes informa o tipo errado para .js, o que quebra o site
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.js': 'text/javascript',
        '.mjs': 'text/javascript',
        '.css': 'text/css',
        '.html': 'text/html',
        '.svg': 'image/svg+xml',
        '.json': 'application/json',
    }

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')  # sempre carrega a versão mais nova dos arquivos
        super().end_headers()

    def log_message(self, fmt, *args):
        pass  # mantém a janela limpa


try:
    server = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), Handler)
except OSError:
    print(f'A porta {PORT} já está em uso. Feche a outra janela do servidor ou rode: python servidor.py 8080')
    input('Pressione Enter para sair...')
    sys.exit(1)

url = f'http://localhost:{PORT}/'
print()
print(f'  Hangar DCS rodando em {url}')
print('  Para parar, feche esta janela (ou Ctrl+C).')
print()
threading.Timer(0.8, lambda: webbrowser.open(url)).start()
try:
    server.serve_forever()
except KeyboardInterrupt:
    pass
