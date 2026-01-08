import { Alert as BootstrapAlert } from 'react-bootstrap';

const Alert = ({ message, transactionHash, variant, setShowAlert, explorerBaseUrl }) => {
  return (
    <BootstrapAlert
      variant={variant}
      onClose={() => setShowAlert(false)}
      dismissible
      className='alert'
    >
      <BootstrapAlert.Heading>{message}</BootstrapAlert.Heading>

      <hr />

      {transactionHash && (
        explorerBaseUrl ? (
          <a
            href={`${explorerBaseUrl}${transactionHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-break"
          >
            {transactionHash.slice(0, 6) + '...' + transactionHash.slice(60, 66)}
          </a>
        ) : (
          <p className="mb-0 text-break">
            {transactionHash.slice(0, 6) + '...' + transactionHash.slice(60, 66)}
          </p>
        )
      )}
    </BootstrapAlert>
  );
}

export default Alert;
