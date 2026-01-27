import { useEffect } from 'react';
import { Alert as BootstrapAlert } from 'react-bootstrap';

const Alert = ({ message, transactionHash, variant, setShowAlert, explorerBaseUrl, autoClose = true, autoCloseDelay = 5000 }) => {
  // Auto-close success alerts after delay
  useEffect(() => {
    if (variant === 'success' && autoClose) {
      const timer = setTimeout(() => {
        setShowAlert(false);
      }, autoCloseDelay);
      return () => clearTimeout(timer);
    }
  }, [variant, autoClose, autoCloseDelay, setShowAlert]);

  // Custom styles for success variant - more subtle and professional
  const successStyles = variant === 'success' ? {
    backgroundColor: '#1a3d2e',
    borderColor: '#28a745',
    borderWidth: '1px',
    borderStyle: 'solid',
    color: '#d4edda'
  } : {};

  const headingStyles = variant === 'success' ? {
    color: '#6cff8f',
    fontSize: '1rem',
    fontWeight: '500'
  } : {};

  const linkStyles = variant === 'success' ? {
    color: '#6cff8f',
    textDecoration: 'none'
  } : {};

  return (
    <BootstrapAlert
      variant={variant}
      onClose={() => setShowAlert(false)}
      dismissible
      className='alert'
      style={successStyles}
    >
      <BootstrapAlert.Heading style={headingStyles}>{message}</BootstrapAlert.Heading>

      <hr style={{ borderColor: variant === 'success' ? 'rgba(108, 255, 143, 0.2)' : undefined }} />

      {transactionHash && (
        explorerBaseUrl ? (
          <a
            href={`${explorerBaseUrl}${transactionHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-break"
            style={linkStyles}
            onMouseEnter={(e) => {
              if (variant === 'success') {
                e.target.style.textDecoration = 'underline';
                e.target.style.color = '#8fffaa';
              }
            }}
            onMouseLeave={(e) => {
              if (variant === 'success') {
                e.target.style.textDecoration = 'none';
                e.target.style.color = '#6cff8f';
              }
            }}
          >
            {transactionHash.slice(0, 6) + '...' + transactionHash.slice(60, 66)}
          </a>
        ) : (
          <p className="mb-0 text-break" style={{ color: variant === 'success' ? '#d4edda' : undefined }}>
            {transactionHash.slice(0, 6) + '...' + transactionHash.slice(60, 66)}
          </p>
        )
      )}
    </BootstrapAlert>
  );
}

export default Alert;
