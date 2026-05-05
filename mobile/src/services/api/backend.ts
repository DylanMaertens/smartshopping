const API_BASE_URL = 'http://127.0.0.1:3000/api/v1';

export async function getProduct(barcode: string) {
  const response = await fetch(`${API_BASE_URL}/products/${barcode}`);
  if (!response.ok) {
    throw new Error(`Backend error: ${response.status}`);
  }
  return response.json();
}
