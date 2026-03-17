import { Link } from 'react-router-dom';
import { Upload, Calculator, FileText, CheckCircle, Zap, Shield, List } from 'lucide-react';

const HomePage = () => {
  const features = [
    {
      icon: Upload,
      title: 'Upload CAD File',
      description: 'Support for STEP and STL files with automatic geometry analysis',
    },
    {
      icon: Calculator,
      title: 'Instant Pricing',
      description: 'Rule-based pricing engine with transparent cost breakdown',
    },
    {
      icon: FileText,
      title: 'Professional Quotes',
      description: 'Generate formal quotation documents ready for clients',
    },
  ];

  const benefits = [
    {
      icon: Zap,
      title: 'Fast & Accurate',
      description: 'Get instant quotes based on actual geometry analysis and engineering rules',
    },
    {
      icon: Shield,
      title: 'Transparent Pricing',
      description: 'Every cost component is calculated and explained. No hidden fees.',
    },
    {
      icon: CheckCircle,
      title: 'Production Ready',
      description: 'Quotes include lead times, material specs, and inspection options',
    },
  ];

  return (
    <div className="space-y-16">
      {/* Hero Section */}
      <section className="text-center py-12">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          CNC Instant Quotation Platform
        </h1>
        <p className="text-xl text-gray-600 max-w-2xl mx-auto mb-8">
          Upload your CAD file, configure your requirements, and get a transparent,
          engineering-based price estimate in seconds.
        </p>
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <Link
            to="/quote"
            className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 text-white font-semibold rounded-lg hover:bg-primary-700 transition-colors"
          >
            <Upload className="w-5 h-5" />
            Start New Quote
          </Link>
          <Link
            to="/quotes"
            className="inline-flex items-center gap-2 px-6 py-3 border border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-50 transition-colors"
          >
            <List className="w-5 h-5" />
            View Quotes
          </Link>
        </div>
      </section>

      {/* How It Works */}
      <section>
        <h2 className="text-2xl font-bold text-gray-900 text-center mb-8">
          How It Works
        </h2>
        <div className="grid md:grid-cols-3 gap-8">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <div
                key={index}
                className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 card-hover"
              >
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center">
                    <Icon className="w-6 h-6 text-primary-600" />
                  </div>
                  <span className="text-3xl font-bold text-gray-200">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {feature.title}
                </h3>
                <p className="text-gray-600">{feature.description}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Benefits */}
      <section className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
        <h2 className="text-2xl font-bold text-gray-900 text-center mb-8">
          Engineering-Grade Quotations
        </h2>
        <div className="grid md:grid-cols-3 gap-8">
          {benefits.map((benefit, index) => {
            const Icon = benefit.icon;
            return (
              <div key={index} className="text-center">
                <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Icon className="w-7 h-7 text-green-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {benefit.title}
                </h3>
                <p className="text-gray-600">{benefit.description}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Pricing Transparency */}
      <section className="bg-gray-900 rounded-2xl p-8 text-white">
        <h2 className="text-2xl font-bold text-center mb-6">
          Transparent Pricing Formula
        </h2>
        <div className="bg-gray-800 rounded-lg p-6 font-mono text-sm max-w-3xl mx-auto">
          <p className="text-gray-400 mb-2"># Material Cost</p>
          <p className="text-green-400 mb-4">
            material_cost = volume × density × cost_per_kg
          </p>
          
          <p className="text-gray-400 mb-2"># Machining Cost</p>
          <p className="text-green-400 mb-4">
            machining_cost = estimated_time × hourly_rate × difficulty_factor
          </p>
          
          <p className="text-gray-400 mb-2"># Final Price</p>
          <p className="text-green-400">
            total_price = (material + machining + finish + inspection) × margin
          </p>
        </div>
        <p className="text-center text-gray-400 mt-6">
          Every calculation is visible and auditable. No black boxes.
        </p>
      </section>

      {/* CTA */}
      <section className="text-center py-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          Ready to Get Started?
        </h2>
        <p className="text-gray-600 mb-6">
          Upload your CAD file and get an instant quote in under a minute.
        </p>
        <Link
          to="/quote"
          className="inline-flex items-center gap-2 px-8 py-4 bg-primary-600 text-white font-semibold rounded-lg hover:bg-primary-700 transition-colors text-lg"
        >
          <Upload className="w-6 h-6" />
          Create Your Quote
        </Link>
      </section>
    </div>
  );
};

export default HomePage;
