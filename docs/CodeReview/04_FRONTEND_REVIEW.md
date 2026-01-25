# Code Review - Frontend
## dBank DeFi Vault

---

## 1. Resumen de Arquitectura Frontend

### 1.1 Stack Tecnologico

| Tecnologia | Version | Uso |
|------------|---------|-----|
| React | 18.2.0 | Framework UI |
| Redux Toolkit | 1.8.4 | State management |
| React Router | 6.3.0 | Routing |
| React Bootstrap | 2.4.0 | Componentes UI |
| ethers.js | 5.x | Web3 |
| ApexCharts | 1.4.0 | Graficos |

### 1.2 Estructura de Componentes

```
src/
├── components/
│   ├── App.js          (182 lineas) - Orquestacion principal
│   ├── Navigation.js   (131 lineas) - Navbar y wallet
│   ├── Tabs.js         (22 lineas)  - Navegacion de tabs
│   ├── Deposit.js      (303 lineas) - Formulario deposito
│   ├── Withdraw.js     (378 lineas) - Formulario retiro
│   ├── Strategies.js   (522 lineas) - Gestion de estrategias
│   ├── Charts.js       (713 lineas) - Graficos
│   ├── Alert.js        (69 lineas)  - Notificaciones
│   └── Loading.js      (12 lineas)  - Estado de carga
├── store/
│   ├── store.js        - Configuracion Redux
│   ├── interactions.js - Logica de contratos
│   └── reducers/       - Redux slices
└── abis/               - ABIs de contratos
```

---

## 2. Problemas de Responsividad

### 2.1 Navigation.js - Navbar No Colapsable (MEDIO)

**Ubicacion:** `Navigation.js:79-126`

**Problema:**
```jsx
<Navbar className='my-3'>
    {/* ... */}
    <Navbar.Toggle aria-controls="nav" />
    <Navbar.Collapse id="nav" className="justify-content-end">
```

El `Navbar.Toggle` existe pero no funciona correctamente porque falta `expand` prop en Navbar:

```jsx
// Actual - sin expand
<Navbar className='my-3'>

// Correcto
<Navbar expand="lg" className='my-3'>
```

**Impacto:**
- En movil, el menu no colapsa correctamente
- Los elementos se apilan de forma desordenada

**Solucion:**
```jsx
<Navbar expand="lg" className='my-3' bg="dark" variant="dark">
```

### 2.2 Deposit.js / Withdraw.js - Card con Width Fijo (MEDIO)

**Ubicacion:** `Deposit.js:168`, `Withdraw.js:239`

**Problema:**
```jsx
<Card style={{ maxWidth: '450px'}} className='mx-auto px-4'>
```

**Impacto:**
- En pantallas pequenas (< 450px), la card mantiene padding excesivo
- No hay breakpoints para diferentes tamanos

**Solucion recomendada:**
```jsx
<Card className='mx-auto px-2 px-md-4' style={{ maxWidth: '450px', width: '100%' }}>
```

### 2.3 Strategies.js - Tabla No Responsive (ALTO)

**Ubicacion:** `Strategies.js:452-486`

**Problema:**
```jsx
<Table bordered size="sm" responsive style={{ backgroundColor: 'transparent' }}>
    <thead>
        <tr>
            <th style={{ width: '30%' }}>Strategy</th>
            <th style={{ width: '20%' }}>Allocated (principal)</th>
            <th style={{ width: '20%' }}>USDC (value)</th>
            <th style={{ width: '30%' }}>% of your total value</th>
        </tr>
    </thead>
```

**Impacto:**
- Porcentajes fijos no se adaptan a pantalla pequena
- El contenido se trunca en movil
- `responsive` prop esta, pero los anchos fijos lo anulan

**Solucion:**
```jsx
// Usar clases Bootstrap en lugar de width fijo
<th className="d-none d-md-table-cell">% of your total value</th>

// O usar texto mas corto en movil
<th>
    <span className="d-none d-md-inline">Allocated (principal)</span>
    <span className="d-md-none">Alloc.</span>
</th>
```

### 2.4 Charts.js - Layout Rigido (MEDIO)

**Ubicacion:** `Charts.js:657-708`

**Problema:**
```jsx
<Row className="mb-4">
    <Col md={6} className="mb-4">
        {/* Chart 1 */}
    </Col>
    <Col md={6} className="mb-4">
        {/* Chart 2 */}
    </Col>
</Row>
```

**Impacto:**
- En tablet (md), los graficos se vuelven muy pequenos
- No hay consideracion para pantallas muy grandes (xl, xxl)

**Solucion:**
```jsx
<Row className="mb-4">
    <Col xs={12} lg={6} xl={6} className="mb-4">
        {/* Chart */}
    </Col>
</Row>
```

### 2.5 Strategies.js - Form.Text Overflow (BAJO)

**Ubicacion:** `Strategies.js:360-363`

**Problema:**
```jsx
<Form.Text style={{ color: '#adb5bd', fontSize: '0.9rem' }}>
    Total shares: {userSharesFormatted} | PPS (effective): {formatWithMaxDecimals(...)} |
    Total value: {...} | Allocated value: {...} | Unallocated value: {...} |
    Remaining cap (selected): {...} | Max alloc: {...} | Max unalloc: {...}
</Form.Text>
```

**Impacto:**
- Texto muy largo en una sola linea
- Se desborda en pantallas pequenas
- Dificil de leer

**Solucion:**
```jsx
<div className="d-flex flex-wrap gap-2 my-2">
    <Badge bg="secondary">Shares: {userSharesFormatted}</Badge>
    <Badge bg="secondary">PPS: {effectivePps}</Badge>
    {/* etc */}
</div>
```

---

## 3. Problemas de Coherencia

### 3.1 Estilos Inline vs CSS (ALTO)

**Problema general:**
La mayoria de los estilos estan inline, lo que causa:
- Dificultad para mantener consistencia
- Repeticion de codigo
- Dificil hacer temas (dark/light mode)

**Ejemplos:**
```jsx
// Deposit.js:172
<Form.Text className='text-end my-2' style={{ color: '#adb5bd', fontSize: '0.9rem' }}>

// Withdraw.js:243
<Form.Text className='text-end my-2' style={{ color: '#adb5bd', fontSize: '0.9rem' }}>

// Strategies.js:361
<Form.Text style={{ color: '#adb5bd', fontSize: '0.9rem' }}>
```

**Solucion:**
Crear archivo CSS con clases reutilizables:

```css
/* src/styles/components.css */
.form-helper-text {
    color: #adb5bd;
    font-size: 0.9rem;
}

.card-dark {
    background-color: #1a1d29;
    border-color: rgba(255, 255, 255, 0.1);
}

.table-dark-transparent {
    background-color: transparent;
    color: #f8f9fa;
}

.table-dark-transparent th,
.table-dark-transparent td {
    border-color: rgba(255, 255, 255, 0.2);
    border-width: 3px;
    background-color: transparent;
}
```

### 3.2 Duplicacion de Codigo entre Deposit y Withdraw (ALTO)

**Problema:**
Los componentes `Deposit.js` y `Withdraw.js` comparten ~70% del codigo:
- Misma estructura de formulario
- Mismos handlers de conversion
- Misma logica de alertas
- Mismos estilos

**Codigo duplicado:**
```jsx
// Deposit.js:39-53 Y Withdraw.js:47-61
const formatWithMaxDecimals = (value, maxDecimals = 4) => {
    if (!value || value === "0" || parseFloat(value) === 0) return "0";
    const num = parseFloat(value);
    if (isNaN(num)) return "0";
    // ... identico
};

// Deposit.js:55-60 Y Withdraw.js:39-44
const explorerMap = {
    1: 'https://etherscan.io/tx/',
    11155111: 'https://sepolia.etherscan.io/tx/',
    31337: ''
};
```

**Solucion:**
Crear componentes y utils compartidos:

```jsx
// src/utils/format.js
export const formatWithMaxDecimals = (value, maxDecimals = 4) => { ... };
export const explorerMap = { ... };

// src/components/shared/AmountForm.js
const AmountForm = ({
    onSubmit,
    usdcAmount,
    sharesAmount,
    onAmountChange,
    buttonText,
    isLoading
}) => { ... };
```

### 3.3 Inconsistencia en Mensajes de Error (MEDIO)

**Problema:**
Algunos mensajes estan en ingles, otros tienen comentarios en espanol:

```jsx
// Withdraw.js:113
alert("You cannot withdraw while you have shares allocated. Unallocate first.");

// Withdraw.js:112 (comentado)
// alert("No puedes retirar mientras tengas shares alocadas. Desaloca primero.");

// Strategies.js:249
alert(`Cannot allocate more than ${maxAllowedFloat} shares...`);

// Deposit.js:148
alert("Please enter a valid amount");
```

**Solucion:**
Implementar i18n o al menos centralizar mensajes:

```jsx
// src/constants/messages.js
export const MESSAGES = {
    INVALID_AMOUNT: "Please enter a valid amount",
    SHARES_ALLOCATED: "You cannot withdraw while you have shares allocated. Unallocate first.",
    ALLOCATION_EXCEEDED: (max) => `Cannot allocate more than ${max} shares.`,
    // ...
};
```

### 3.4 Manejo Inconsistente de Estados de Carga (MEDIO)

**Problema:**
Cada componente maneja loading de forma diferente:

```jsx
// Charts.js - usa Loading component
if (loading) return <Loading />;

// Deposit.js - usa Spinner inline
{isDepositing ? <Spinner ... /> : "Deposit"}

// Strategies.js - usa Spinner pero diferente estructura
{isAllocating ? <><Spinner .../> Allocating...</> : "Allocate"}
```

**Solucion:**
Estandarizar el patron de loading:

```jsx
// src/components/shared/ActionButton.js
const ActionButton = ({ isLoading, loadingText, text, ...props }) => (
    <Button disabled={isLoading} {...props}>
        {isLoading ? (
            <>
                <Spinner as="span" animation="border" size="sm" className="me-2" />
                {loadingText}
            </>
        ) : text}
    </Button>
);
```

---

## 4. Problemas de UX

### 4.1 Falta Validacion Visual en Inputs (MEDIO)

**Ubicacion:** Todos los formularios

**Problema:**
No hay feedback visual cuando el input es invalido:

```jsx
<Form.Control
    type='number'
    placeholder='0.0'
    min='0.0'
    // No hay isInvalid prop
    // No hay Form.Control.Feedback
/>
```

**Solucion:**
```jsx
<Form.Control
    type='number'
    placeholder='0.0'
    min='0.0'
    isInvalid={parseFloat(amount) > maxAvailable}
/>
<Form.Control.Feedback type="invalid">
    Amount exceeds available balance
</Form.Control.Feedback>
```

### 4.2 Alertas No Se Cierran Automaticamente (BAJO)

**Ubicacion:** `Alert.js`

**Problema:**
Las alertas requieren click manual para cerrar. En una DApp, los usuarios esperan que las alertas de exito se cierren solas.

**Solucion:**
```jsx
useEffect(() => {
    if (variant === 'success') {
        const timer = setTimeout(() => setShowAlert(false), 5000);
        return () => clearTimeout(timer);
    }
}, [variant, setShowAlert]);
```

### 4.3 Sin Confirmacion para Acciones Destructivas (ALTO)

**Ubicacion:** Withdraw, Unallocate

**Problema:**
No hay dialogo de confirmacion antes de retirar o desalocar:

```jsx
// Withdraw.js - submitea directamente
const withdrawHandler = async (e) => {
    e.preventDefault();
    // Sin confirmacion
    await withdrawFunds(...);
};
```

**Solucion:**
Agregar modal de confirmacion:

```jsx
const [showConfirm, setShowConfirm] = useState(false);

const handleWithdrawClick = () => {
    setShowConfirm(true);
};

const confirmWithdraw = async () => {
    setShowConfirm(false);
    await withdrawFunds(...);
};

// Render
<Modal show={showConfirm} onHide={() => setShowConfirm(false)}>
    <Modal.Header closeButton>
        <Modal.Title>Confirm Withdrawal</Modal.Title>
    </Modal.Header>
    <Modal.Body>
        Are you sure you want to withdraw {amount} USDC?
    </Modal.Body>
    <Modal.Footer>
        <Button variant="secondary" onClick={() => setShowConfirm(false)}>
            Cancel
        </Button>
        <Button variant="primary" onClick={confirmWithdraw}>
            Confirm
        </Button>
    </Modal.Footer>
</Modal>
```

### 4.4 No Hay Indicador de Red Incorrecta (ALTO)

**Ubicacion:** `App.js`, `Navigation.js`

**Problema:**
Si el usuario esta en una red no soportada, solo ve un dropdown sin feedback claro.

**Solucion:**
Mostrar banner de advertencia:

```jsx
// App.js
const supportedChains = [31337, 11155111];
const isWrongNetwork = chainId && !supportedChains.includes(chainId);

{isWrongNetwork && (
    <Alert variant="warning" className="text-center">
        You are connected to an unsupported network.
        Please switch to Hardhat Local or Sepolia.
    </Alert>
)}
```

---

## 5. Problemas de Estado y Redux

### 5.1 Selectors No Memoizados (MEDIO)

**Ubicacion:** Multiples componentes

**Problema:**
Los selectores crean nuevas referencias en cada render:

```jsx
// Strategies.js
const strategies = useSelector(state => state.strategyRouter.strategies) || [];
const userStrategyAllocations = useMemo(() => userStrategyAllocationsRaw || [], [userStrategyAllocationsRaw]);
```

El `|| []` crea un nuevo array en cada render si `strategies` es undefined.

**Solucion:**
Usar reselect o memoizar correctamente:

```jsx
// store/selectors.js
import { createSelector } from '@reduxjs/toolkit';

export const selectStrategies = createSelector(
    state => state.strategyRouter.strategies,
    strategies => strategies || []
);

// Component
const strategies = useSelector(selectStrategies);
```

### 5.2 Dependencias de useEffect Incorrectas (MEDIO)

**Ubicacion:** `Charts.js:100-233`

**Problema:**
```jsx
// eslint-disable-next-line react-hooks/exhaustive-deps
useEffect(() => {
    loadChartData();
    const interval = setInterval(loadChartData, 30000);
    return () => clearInterval(interval);
}, [dBank, provider, account]);
```

El comentario `eslint-disable` sugiere que hay dependencias faltantes.

**Solucion:**
Usar `useCallback` para `loadChartData` y incluirlo como dependencia:

```jsx
const loadChartData = useCallback(async () => {
    // ...
}, [dBank, provider, account, dispatch]);

useEffect(() => {
    loadChartData();
    const interval = setInterval(loadChartData, 30000);
    return () => clearInterval(interval);
}, [loadChartData]);
```

### 5.3 Llamadas a Contratos en Handlers de Eventos (MEDIO)

**Ubicacion:** `Deposit.js:62-94`, `Withdraw.js:147-175`

**Problema:**
```jsx
const amountHandler = async (e) => {
    // Hace llamada al contrato en cada keystroke
    const sharesInWei = await dBank.convertToShares(amountInWei);
};
```

**Impacto:**
- Llamadas excesivas al nodo RPC
- Posible rate limiting
- UI lenta en redes lentas

**Solucion:**
Usar debounce:

```jsx
import { useDebouncedCallback } from 'use-debounce';

const debouncedConvert = useDebouncedCallback(
    async (value) => {
        const shares = await dBank.convertToShares(value);
        setSharesAmount(shares);
    },
    300 // 300ms delay
);

const amountHandler = (e) => {
    setUsdcAmount(e.target.value);
    debouncedConvert(e.target.value);
};
```

---

## 6. Problemas de Rendimiento

### 6.1 Re-renders Innecesarios en Charts.js (ALTO)

**Ubicacion:** `Charts.js`

**Problema:**
El componente tiene 713 lineas con muchos `useMemo` y `useEffect`, pero aun asi puede re-renderizar excesivamente porque:

1. `historicalData` es un objeto nuevo en cada setState
2. Multiples useEffects que se disparan en cascada
3. ApexCharts re-renderiza con cada cambio de options

**Solucion:**
1. Separar en sub-componentes (AllocationPieChart, PriceLineChart, etc.)
2. Usar `React.memo` en charts individuales
3. Memoizar options de ApexCharts correctamente

```jsx
const PriceLineChart = React.memo(({ data, options }) => (
    <Chart options={options} series={data} type="line" height={300} />
));
```

### 6.2 LocalStorage Accedido Sincronamente (BAJO)

**Ubicacion:** `Charts.js:323-338`

**Problema:**
```jsx
const getHistoricalData = (key) => {
    const data = localStorage.getItem(`dBank_${key}`);
    return data ? JSON.parse(data) : [];
};
```

`JSON.parse` es sincrono y puede bloquear el main thread con datos grandes.

**Solucion:**
Para datos grandes, considerar IndexedDB con una libreria como `idb-keyval`:

```jsx
import { get, set } from 'idb-keyval';

const getHistoricalData = async (key) => {
    return await get(`dBank_${key}`) || [];
};
```

---

## 7. Accesibilidad (A11y)

### 7.1 Falta aria-labels (MEDIO)

**Problema:**
Botones e inputs carecen de labels accesibles:

```jsx
// Navigation.js - boton sin aria-label
<Button onClick={connectHandler}>Connect</Button>

// Deposit.js - input sin label asociado
<Form.Control type='number' id="usdc" />
```

**Solucion:**
```jsx
<Button onClick={connectHandler} aria-label="Connect wallet">
    Connect
</Button>

<Form.Label htmlFor="usdc" className="visually-hidden">
    USDC Amount
</Form.Label>
<Form.Control type='number' id="usdc" aria-describedby="usdcHelp" />
```

### 7.2 Contraste de Colores (BAJO)

**Problema:**
Algunos textos tienen bajo contraste:

```jsx
style={{ color: '#adb5bd' }} // Gris claro sobre fondo oscuro
```

**Verificar:** Usar herramientas como WebAIM Contrast Checker

---

## 8. Resumen de Prioridades

### Alta Prioridad

1. **Navbar responsivo** - Agregar `expand="lg"`
2. **Tabla de estrategias responsive** - Usar clases Bootstrap
3. **Refactorizar codigo duplicado** - Utils y componentes compartidos
4. **Confirmacion para acciones destructivas** - Modales
5. **Indicador de red incorrecta** - Banner visible
6. **Debounce en conversiones** - Evitar rate limiting

### Media Prioridad

7. **Estilos centralizados** - CSS externo
8. **Mensajes consistentes** - Centralizar strings
9. **Validacion visual** - isInvalid en Form.Control
10. **Memoizar selectores** - Reselect
11. **Fix dependencias useEffect** - Eliminar eslint-disable

### Baja Prioridad

12. **Auto-cerrar alertas de exito**
13. **Accesibilidad** - aria-labels
14. **Separar Charts.js** - Sub-componentes
15. **IndexedDB** - Para datos grandes

---

## 9. Checklist Pre-Release

- [ ] Todos los formularios validan input antes de submit
- [ ] Navbar funciona en movil (colapsa correctamente)
- [ ] Tablas son legibles en pantallas pequenas
- [ ] No hay codigo duplicado entre componentes
- [ ] Mensajes de error son claros y consistentes
- [ ] Acciones destructivas tienen confirmacion
- [ ] Red incorrecta muestra advertencia clara
- [ ] No hay errores en console del navegador
- [ ] Performance: First Contentful Paint < 2s
- [ ] Accesibilidad: Score > 80 en Lighthouse
