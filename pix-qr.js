/* PIX BR Code helpers. QRCode is provided by the qrcode browser bundle. */
(function () {
  function tlv(id, value) {
    const text = String(value);
    const length = new TextEncoder().encode(text).length;
    return id + String(length).padStart(2, "0") + text;
  }

  function crc16(value) {
    const bytes = new TextEncoder().encode(value);
    let crc = 0xffff;
    for (const byte of bytes) {
      crc ^= byte << 8;
      for (let bit = 0; bit < 8; bit++) crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
    }
    return (crc & 0xffff).toString(16).toUpperCase().padStart(4, "0");
  }

  function buildPixPayload({ key, owner, amount }) {
    const cleanKey = String(key || "").trim();
    if (!cleanKey) throw new Error("Informe a chave PIX.");
    const merchant = String(owner || "WALK CARDS").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9 $%*+\-./:]/g, " ").trim().slice(0, 25) || "WALK CARDS";
    const amountValue = Number(amount);
    let payload = tlv("00", "01")
      + tlv("26", tlv("00", "br.gov.bcb.pix") + tlv("01", cleanKey))
      + tlv("52", "0000") + tlv("53", "986");
    if (Number.isFinite(amountValue) && amountValue > 0) payload += tlv("54", amountValue.toFixed(2));
    payload += tlv("58", "BR") + tlv("59", merchant) + tlv("60", "BRASIL") + tlv("62", tlv("05", "***")) + "6304";
    return payload + crc16(payload);
  }

  function render(canvas, payload, size = 220) {
    if (!window.QRCode?.toCanvas) throw new Error("O gerador de QR Code não carregou. Confira sua conexão e tente novamente.");
    return window.QRCode.toCanvas(canvas, payload, { width: size, margin: 2, errorCorrectionLevel: "M", color: { dark: "#17142b", light: "#ffffff" } });
  }

  window.PixQr = { buildPixPayload, render };
})();
