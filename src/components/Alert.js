import { Alert as BootstrapAlert } from 'react-bootstrap';

const Alert = ({ message, transactionHash, variant, setShowAlert, explorerBaseUrl, errorDetails }) => {
  // Custom styles based on variant
  const getContainerStyles = () => {
    if (variant === 'success') {
      return {
        backgroundColor: '#1a3d2e',
        borderColor: '#28a745',
        borderWidth: '1px',
        borderStyle: 'solid',
        color: '#d4edda'
      };
    }
    if (variant === 'danger') {
      return {
        backgroundColor: '#3d1a1a',
        borderColor: '#dc3545',
        borderWidth: '1px',
        borderStyle: 'solid',
        color: '#f8d7da'
      };
    }
    return {};
  };

  const getHeadingStyles = () => {
    if (variant === 'success') {
      return { color: '#6cff8f', fontSize: '1rem', fontWeight: '500' };
    }
    if (variant === 'danger') {
      return { color: '#ff6b6b', fontSize: '1rem', fontWeight: '500' };
    }
    return {};
  };

  const getLinkStyles = () => {
    if (variant === 'success') {
      return { color: '#6cff8f', textDecoration: 'none' };
    }
    return {};
  };

  const getHrColor = () => {
    if (variant === 'success') return 'rgba(108, 255, 143, 0.2)';
    if (variant === 'danger') return 'rgba(255, 107, 107, 0.2)';
    return undefined;
  };

  return (
    <BootstrapAlert
      variant={variant}
      onClose={() => setShowAlert(false)}
      dismissible
      className='alert'
      style={getContainerStyles()}
    >
      <BootstrapAlert.Heading style={getHeadingStyles()}>{message}</BootstrapAlert.Heading>

      <hr style={{ borderColor: getHrColor() }} />

      {/* Show error details for failed transactions */}
      {variant === 'danger' && errorDetails && (
        <div style={{ 
          backgroundColor: 'rgba(0, 0, 0, 0.2)', 
          padding: '10px', 
          borderRadius: '4px',
          marginBottom: '10px',
          fontSize: '0.85rem',
          wordBreak: 'break-word'
        }}>
          <strong style={{ color: '#ff9999' }}>Error details:</strong>
          <p style={{ marginBottom: 0, marginTop: '5px', color: '#f8d7da' }}>
            {errorDetails}
          </p>
        </div>
      )}

      {/* Show transaction hash link for successful transactions */}
      {transactionHash && (
        explorerBaseUrl ? (
          <a
            href={`${explorerBaseUrl}${transactionHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-break"
            style={getLinkStyles()}
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
            View transaction: {transactionHash.slice(0, 6) + '...' + transactionHash.slice(60, 66)}
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
