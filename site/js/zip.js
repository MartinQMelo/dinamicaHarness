// Gera um .zip sem compressão (método "stored"), sem biblioteca: o harness são três arquivos de texto.
// Nomes em UTF-8 (bit 11 das flags). Sem Firebase, para os testes importarem.

const TABELA_CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

export function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = TABELA_CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// Data e hora no formato do DOS, que o zip usa.
function dataDos(d) {
  return {
    hora: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    data: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

// arquivos: { 'nome.txt': 'conteúdo' } → Uint8Array com o .zip.
export function criarZip(arquivos, quando = new Date()) {
  const texto = new TextEncoder();
  const { hora, data } = dataDos(quando);
  const locais = [];
  const centrais = [];
  let deslocamento = 0;
  for (const [nome, conteudo] of Object.entries(arquivos)) {
    const n = texto.encode(nome);
    const dados = texto.encode(conteudo);
    const crc = crc32(dados);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true);
    local.setUint16(8, 0, true);
    local.setUint16(10, hora, true);
    local.setUint16(12, data, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, dados.length, true);
    local.setUint32(22, dados.length, true);
    local.setUint16(26, n.length, true);
    local.setUint16(28, 0, true);
    locais.push(new Uint8Array(local.buffer), n, dados);

    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(4, 20, true);
    central.setUint16(6, 20, true);
    central.setUint16(8, 0x0800, true);
    central.setUint16(10, 0, true);
    central.setUint16(12, hora, true);
    central.setUint16(14, data, true);
    central.setUint32(16, crc, true);
    central.setUint32(20, dados.length, true);
    central.setUint32(24, dados.length, true);
    central.setUint16(28, n.length, true);
    central.setUint32(42, deslocamento, true); // os outros campos (extra, comentário, atributos) ficam 0
    centrais.push(new Uint8Array(central.buffer), n);
    deslocamento += 30 + n.length + dados.length;
  }
  const tamanhoCentral = centrais.reduce((s, p) => s + p.length, 0);
  const fim = new DataView(new ArrayBuffer(22));
  fim.setUint32(0, 0x06054b50, true);
  fim.setUint16(8, Object.keys(arquivos).length, true);
  fim.setUint16(10, Object.keys(arquivos).length, true);
  fim.setUint32(12, tamanhoCentral, true);
  fim.setUint32(16, deslocamento, true);
  const partes = [...locais, ...centrais, new Uint8Array(fim.buffer)];
  const saida = new Uint8Array(partes.reduce((s, p) => s + p.length, 0));
  let i = 0;
  for (const p of partes) { saida.set(p, i); i += p.length; }
  return saida;
}
