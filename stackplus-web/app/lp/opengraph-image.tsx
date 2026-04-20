import { ImageResponse } from 'next/og'

export const alt =
  'StackPlus — Organize seu home game como um profissional, sem planilha, sem confusão.'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          backgroundColor: '#050D15',
          padding: '64px 72px',
          backgroundImage:
            'radial-gradient(circle at 90% 10%, rgba(0,200,224,0.28), transparent 55%), radial-gradient(circle at 10% 90%, rgba(0,200,224,0.12), transparent 50%)',
          fontFamily: 'sans-serif',
          color: '#ffffff',
        }}
      >
        {/* Top bar: badge */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '8px 18px',
              border: '1px solid rgba(0,200,224,0.45)',
              borderRadius: 999,
              backgroundColor: 'rgba(7,24,40,0.7)',
              fontSize: 20,
              color: '#00C8E0',
              letterSpacing: '0.15em',
              fontWeight: 700,
            }}
          >
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: 999,
                backgroundColor: '#00C8E0',
                display: 'flex',
                boxShadow: '0 0 12px rgba(0,200,224,0.9)',
              }}
            />
            BETA ABERTO
          </div>
        </div>

        {/* Middle: brand + headline + tv mock */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            gap: 48,
          }}
        >
          {/* Left column: brand + headline */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 28,
              maxWidth: 620,
            }}
          >
            <div
              style={{
                display: 'flex',
                fontSize: 132,
                fontWeight: 900,
                color: '#00C8E0',
                letterSpacing: '-0.04em',
                lineHeight: 1,
                textShadow:
                  '0 0 40px rgba(0,200,224,0.9), 0 0 80px rgba(0,200,224,0.4)',
              }}
            >
              STACK+
            </div>
            <div
              style={{
                display: 'flex',
                fontSize: 42,
                fontWeight: 700,
                color: '#ffffff',
                lineHeight: 1.2,
                letterSpacing: '-0.02em',
              }}
            >
              Organize seu home game como um profissional.
            </div>
          </div>

          {/* Right column: TV-like mock card */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
              padding: 28,
              border: '2px solid #1A3550',
              borderRadius: 28,
              backgroundColor: 'rgba(7,24,40,0.85)',
              boxShadow:
                '0 0 60px rgba(0,200,224,0.35), inset 0 0 40px rgba(0,200,224,0.05)',
              width: 360,
            }}
          >
            <div
              style={{
                display: 'flex',
                fontSize: 14,
                color: '#4A7A90',
                letterSpacing: '0.3em',
                fontWeight: 700,
              }}
            >
              TORNEIO DA GALERA
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                fontSize: 100,
                fontWeight: 900,
                color: '#00C8E0',
                letterSpacing: '-0.04em',
                lineHeight: 1,
                textShadow:
                  '0 0 32px rgba(0,200,224,0.85), 0 0 64px rgba(0,200,224,0.35)',
              }}
            >
              09:53
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 20,
                color: '#e4e4e7',
                paddingTop: 12,
                borderTop: '1px solid #132A40',
              }}
            >
              <div style={{ display: 'flex' }}>10 jogadores</div>
              <div style={{ display: 'flex', color: '#00C8E0' }}>R$ 680</div>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            paddingTop: 28,
            borderTop: '1px solid #132A40',
          }}
        >
          <div
            style={{
              display: 'flex',
              fontSize: 24,
              color: '#9ca3af',
              fontWeight: 600,
            }}
          >
            stackplus.com.br
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              fontSize: 18,
              color: '#4A7A90',
              letterSpacing: '0.35em',
              fontWeight: 700,
            }}
          >
            UM PRODUTO SX POKER
          </div>
        </div>
      </div>
    ),
    { ...size },
  )
}
