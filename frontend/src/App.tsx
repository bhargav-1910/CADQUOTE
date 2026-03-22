import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import HomePage from './pages/HomePage';
import QuoteBuilder from './pages/QuoteBuilder';
import QuoteList from './pages/QuoteList';
import QuoteDetail from './pages/QuoteDetail';
import AdminPricing from './pages/AdminPricing';

function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/quote" element={<QuoteBuilder />} />
          <Route path="/quotes" element={<QuoteList />} />
          <Route path="/quotes/:quoteId" element={<QuoteDetail />} />
          <Route path="/admin/pricing" element={<AdminPricing />} />
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;
