import { toast } from 'sonner';

// Helper to get environment variables that works in both web (Vite) and React Native (Expo)
const getEnv = (key: string): string | undefined => {
  // Check for Vite environment (web)
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    return (import.meta.env as any)[key];
  }
  // Check for Expo environment (React Native)
  if (typeof process !== 'undefined' && process.env) {
    const expoKey = key.replace('VITE_', 'EXPO_PUBLIC_');
    return process.env[expoKey] || process.env[key];
  }
  return undefined;
};

const PINATA_JWT = getEnv('VITE_PINATA_JWT');
const PINATA_API = 'https://api.pinata.cloud/pinning/pinFileToIPFS';

export async function uploadToIPFS(file: File): Promise<string> {
  if (!PINATA_JWT || PINATA_JWT === 'your_pinata_jwt_here') {
    throw new Error('Pinata JWT not configured. Set VITE_PINATA_JWT in .env');
  }

  const formData = new FormData();
  formData.append('file', file);

  try {
    const response = await fetch(PINATA_API, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PINATA_JWT}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Upload failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data.IpfsHash; // Returns: Qm...
  } catch (error) {
    console.error('IPFS upload error:', error);
    toast.error('Failed to upload to IPFS');
    throw error;
  }
}

export function getIPFSUrl(hash: string): string {
  return `https://gateway.pinata.cloud/ipfs/${hash}`;
}
