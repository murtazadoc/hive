import { useState, useEffect } from 'react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

function App() {
  const [apiStatus, setApiStatus] = useState<string>('Checking...')

  useEffect(() => {
    fetch(`${API_URL}/health`)
      .then(res => res.json())
      .then(data => setApiStatus(`API Online: ${data.status}`))
      .catch(() => setApiStatus('API Offline'))
  }, [])

  return (
    <div style={{ 
      fontFamily: 'system-ui, sans-serif',
      maxWidth: '1200px',
      margin: '0 auto',
      padding: '20px'
    }}>
      <header style={{ 
        background: '#f59e0b',
        color: 'white',
        padding: '20px',
        borderRadius: '8px',
        marginBottom: '20px'
      }}>
        <h1 style={{ margin: 0 }}>🐝 HIVE Admin Dashboard</h1>
        <p style={{ margin: '10px 0 0 0', opacity: 0.9 }}>Manage your marketplace</p>
      </header>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
        gap: '20px',
        marginBottom: '20px'
      }}>
        <StatCard title="API Status" value={apiStatus} icon="🔌" />
        <StatCard title="Total Users" value="0" icon="👥" />
        <StatCard title="Total Products" value="0" icon="📦" />
        <StatCard title="Total Orders" value="0" icon="🛒" />
      </div>

      <div style={{
        background: 'white',
        borderRadius: '8px',
        padding: '20px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      }}>
        <h2>Quick Actions</h2>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <Button>View Users</Button>
          <Button>View Products</Button>
          <Button>View Orders</Button>
          <Button>View Businesses</Button>
        </div>
      </div>

      <footer style={{ 
        marginTop: '40px',
        textAlign: 'center',
        color: '#666'
      }}>
        <p>HIVE Admin v1.0 | API: {API_URL}</p>
      </footer>
    </div>
  )
}

function StatCard({ title, value, icon }: { title: string, value: string, icon: string }) {
  return (
    <div style={{
      background: 'white',
      borderRadius: '8px',
      padding: '20px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
    }}>
      <div style={{ fontSize: '2rem' }}>{icon}</div>
      <h3 style={{ margin: '10px 0 5px 0', color: '#666' }}>{title}</h3>
      <p style={{ margin: 0, fontSize: '1.5rem', fontWeight: 'bold' }}>{value}</p>
    </div>
  )
}

function Button({ children }: { children: React.ReactNode }) {
  return (
    <button style={{
      background: '#f59e0b',
      color: 'white',
      border: 'none',
      padding: '10px 20px',
      borderRadius: '6px',
      cursor: 'pointer',
      fontSize: '14px'
    }}>
      {children}
    </button>
  )
}

export default App
