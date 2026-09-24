import React, { useState } from 'react';
import {
    ArrowRight,
    Boxes,
    CalendarClock,
    CheckCircle2,
    ChevronDown,
    FileText,
    History,
    Map,
    Menu,
    PackageCheck,
    QrCode,
    ScanLine,
    ShieldCheck,
    Sparkles,
    X,
} from 'lucide-react';
import { motion } from 'framer-motion';
import './inventory-landing.css';

type InventoryLandingPageProps = {
    onGetStarted?: () => void;
    onLogin?: () => void;
};

const rooms = [
    { name: 'Room 1', sku: 15, status: 'Healthy', tone: 'healthy' },
    { name: 'Room 4', sku: 8, status: 'Low stock', tone: 'warning' },
    { name: 'Room 6', sku: 2, status: 'Expiring soon', tone: 'danger' },
];

const features = [
    {
        icon: Map,
        title: 'Interactive Clinic',
        description:
            'View your clinic through a room-based layout and understand where every item is stored.',
    },
    {
        icon: Boxes,
        title: 'Room Inventory',
        description:
            'Separate supplies by treatment room and monitor room-level quantities more accurately.',
    },
    {
        icon: Sparkles,
        title: 'Partner Auto-Sync',
        description:
            'Eligible purchases from connected partners can flow directly into your inventory records.',
    },
    {
        icon: ScanLine,
        title: 'Smart OCR',
        description:
            'Scan invoices and capture product details without manually typing every purchase line.',
    },
    {
        icon: History,
        title: 'Purchase History',
        description:
            'Review what was purchased, when it was purchased, and where it came from.',
    },
    {
        icon: CalendarClock,
        title: 'Expiry & Batch Tracking',
        description:
            'Track batch and expiry information so items nearing expiry can be identified earlier.',
    },
];

const faqs = [
    {
        question: 'Can I manage stock by treatment room?',
        answer:
            'Yes. Inventory can be organised by individual clinic rooms so staff can understand exactly where items are stored.',
    },
    {
        question: 'Can I track batch and expiry information?',
        answer:
            'Yes. Items can include batch and expiry details, making it easier to identify items that need attention before they expire.',
    },
    {
        question: 'Can invoices be scanned automatically?',
        answer:
            'Smart OCR can capture useful product and purchase details from invoices, reducing manual data entry.',
    },
    {
        question: 'Can I export inventory reports?',
        answer:
            'Yes. Inventory information can be exported for internal review, documentation, and reporting purposes.',
    },
];

const InventoryLandingPage: React.FC<InventoryLandingPageProps> = ({
    onGetStarted,
    onLogin,
}) => {
    const [menuOpen, setMenuOpen] = useState(false);
    const [activeRoom, setActiveRoom] = useState(0);
    const [openFaq, setOpenFaq] = useState<number | null>(null);

    const handleGetStarted = () => {
        if (onGetStarted) {
            onGetStarted();
            return;
        }

        window.location.assign('https://app.snabbb.com/signup');
    };

    const handleLogin = () => {
        if (onLogin) {
            onLogin();
            return;
        }

        window.location.assign('https://app.snabbb.com');
    };

    return (
        <main className="inventory-landing">
            <nav className="inventory-nav">
                <a className="inventory-brand" href="#top" aria-label="Snabbb Inventory home">
                    <img src="/icons/Snabbb-Teal.png" alt="Snabbb" />
                    <span>Inventory</span>
                </a>

                <div className={`inventory-nav-links ${menuOpen ? 'is-open' : ''}`}>
                    <a href="#features" onClick={() => setMenuOpen(false)}>
                        Features
                    </a>
                    <a href="#workflow" onClick={() => setMenuOpen(false)}>
                        How It Works
                    </a>
                    <a href="#integrations" onClick={() => setMenuOpen(false)}>
                        Integrations
                    </a>
                    <a href="#faq" onClick={() => setMenuOpen(false)}>
                        FAQ
                    </a>
                    <div className="mobile-nav-actions">
                        <button
                            className="mobile-nav-login"
                            onClick={() => {
                                setMenuOpen(false);
                                handleLogin();
                            }}
                        >
                            Log In
                        </button>
                    </div>
                </div>

                <div className="inventory-nav-actions">
                    <button className="inventory-login" onClick={handleLogin}>
                        Log In
                    </button>
                    <button className="inventory-nav-cta" onClick={handleGetStarted}>
                        Get Started
                        <ArrowRight size={17} />
                    </button>
                </div>

                <button
                    className="inventory-menu-button"
                    onClick={() => setMenuOpen((current) => !current)}
                    aria-label="Toggle navigation"
                >
                    {menuOpen ? <X size={23} /> : <Menu size={23} />}
                </button>
            </nav>

            <section id="top" className="inventory-hero">
                <div className="inventory-hero-copy">
                    <div className="inventory-eyebrow">
                        <span className="inventory-live-dot" />
                        Built for modern clinics
                    </div>

                    <h1>
                        Your clinic inventory,
                        <em> organised room by room.</em>
                    </h1>

                    <p>
                        Track supplies, monitor expiry dates, scan invoices, and understand
                        your stock position from one clear inventory workspace.
                    </p>

                    <div className="inventory-hero-actions">
                        <button className="inventory-primary-button" onClick={handleGetStarted}>
                            Get Started
                            <ArrowRight size={18} />
                        </button>

                        <a className="inventory-secondary-button" href="#features">
                            Explore Features
                        </a>
                    </div>

                    <div className="inventory-trust-row">
                        <span>
                            <CheckCircle2 size={16} />
                            Room-level visibility
                        </span>
                        <span>
                            <CheckCircle2 size={16} />
                            Expiry awareness
                        </span>
                        <span>
                            <CheckCircle2 size={16} />
                            Faster recording
                        </span>
                    </div>
                </div>

                <div className="inventory-hero-preview">
                    <div className="preview-glow preview-glow-one" />
                    <div className="preview-glow preview-glow-two" />

                    <motion.div
                        className="clinic-preview image-preview"
                        initial={{ opacity: 0, y: 22 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.7 }}
                    >
                        <img
                            src="/images/clinic-preview.png"
                            alt="Interactive clinic inventory preview"
                        />
                    </motion.div>

                    <motion.div
                        className="floating-expiry-card"
                        animate={{ y: [0, -7, 0] }}
                        transition={{ duration: 3.5, repeat: Infinity }}
                    >
                        <CalendarClock size={18} />
                        <div>
                            <strong>Expiry watch</strong>
                            <span>3 items need attention</span>
                        </div>
                    </motion.div>

                    <motion.div
                        className="floating-sync-card"
                        animate={{ y: [0, 7, 0] }}
                        transition={{ duration: 4, repeat: Infinity }}
                    >
                        <CheckCircle2 size={18} />
                        <span>Purchase synced</span>
                    </motion.div>
                </div>
            </section>

            <section className="inventory-stat-strip">
                <div>
                    <strong>1</strong>
                    <span>connected workspace</span>
                </div>
                <div>
                    <strong>6</strong>
                    <span>core inventory tools</span>
                </div>
                <div>
                    <strong>24/7</strong>
                    <span>stock visibility</span>
                </div>
                <div>
                    <strong>0</strong>
                    <span>guesswork required</span>
                </div>
            </section>

            <section id="features" className="inventory-section inventory-features">
                <div className="inventory-section-heading">
                    <div className="inventory-section-label">Everything in one place</div>
                    <h2>Inventory control that feels clear.</h2>
                    <p>
                        From room stock to expiry awareness, Snabbb Inventory helps your
                        team stay informed without adding unnecessary complexity.
                    </p>
                </div>

                <div className="inventory-feature-grid">
                    {features.map((feature, index) => {
                        const Icon = feature.icon;

                        return (
                            <motion.article
                                className="inventory-feature-card"
                                key={feature.title}
                                initial={{ opacity: 0, y: 18 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true, amount: 0.2 }}
                                transition={{ duration: 0.45, delay: index * 0.04 }}
                            >
                                <div className="inventory-feature-icon">
                                    <Icon size={22} />
                                </div>
                                <h3>{feature.title}</h3>
                                <p>{feature.description}</p>
                                <span className="feature-arrow">
                                    <ArrowRight size={17} />
                                </span>
                            </motion.article>
                        );
                    })}
                </div>
            </section>

            <section id="workflow" className="inventory-section inventory-workflow">
                <div className="workflow-visual">
                    <div className="workflow-card">
                        <div className="workflow-card-header">
                            <div>
                                <small>Inventory status</small>
                                <h3>Today at a glance</h3>
                            </div>
                            <span className="workflow-check">
                                <CheckCircle2 size={18} />
                            </span>
                        </div>

                        <div className="workflow-progress">
                            <div className="workflow-progress-label">
                                <span>Stock awareness</span>
                                <strong>86%</strong>
                            </div>
                            <div className="workflow-progress-track">
                                <span />
                            </div>
                        </div>

                        <div className="workflow-list">
                            <div>
                                <span className="workflow-list-icon teal">
                                    <Boxes size={16} />
                                </span>
                                <span>
                                    <strong>Room inventory</strong>
                                    <small>12 rooms updated</small>
                                </span>
                                <CheckCircle2 size={17} />
                            </div>

                            <div>
                                <span className="workflow-list-icon amber">
                                    <CalendarClock size={16} />
                                </span>
                                <span>
                                    <strong>Expiry review</strong>
                                    <small>3 items to check</small>
                                </span>
                                <ArrowRight size={17} />
                            </div>

                            <div>
                                <span className="workflow-list-icon blue">
                                    <FileText size={16} />
                                </span>
                                <span>
                                    <strong>Purchase history</strong>
                                    <small>Updated 8 minutes ago</small>
                                </span>
                                <CheckCircle2 size={17} />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="workflow-copy">
                    <div className="inventory-section-label">How it works</div>
                    <h2>A simpler stock workflow for your team.</h2>
                    <p>
                        Keep the important information close to the people who need it.
                        Snabbb Inventory connects daily stock checking, purchasing, and
                        expiry awareness in one workflow.
                    </p>

                    <div className="workflow-steps">
                        <div>
                            <span>01</span>
                            <p>
                                <strong>Add or scan purchases</strong>
                                Record incoming stock manually or use Smart OCR to reduce typing.
                            </p>
                        </div>

                        <div>
                            <span>02</span>
                            <p>
                                <strong>Assign items to rooms</strong>
                                See exactly where supplies are stored across the clinic.
                            </p>
                        </div>

                        <div>
                            <span>03</span>
                            <p>
                                <strong>Review stock and expiry</strong>
                                Identify low-stock and near-expiry items earlier.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            <section id="integrations" className="inventory-section inventory-integrations">
                <div className="integration-copy">
                    <div className="inventory-section-label">Connected purchasing</div>
                    <h2>Less manual entry. More accurate records.</h2>
                    <p>
                        Eligible purchases from MR.BUR, Endora, Kaneiko, and Lunaflow can
                        flow directly into Snabbb Inventory, helping your records stay
                        current.
                    </p>

                    <div className="integration-list">
                        <span>MR.BUR</span>
                        <span>Endora</span>
                        <span>Kaneiko</span>
                        <span>Lunaflow</span>
                    </div>

                    <button className="inventory-outline-button" onClick={handleGetStarted}>
                        Explore Inventory
                        <ArrowRight size={17} />
                    </button>
                </div>

                <div className="integration-visual">
                    <div className="integration-node node-main">
                        <PackageCheck size={23} />
                        <strong>Snabbb Inventory</strong>
                        <small>Central stock record</small>
                    </div>

                    <div className="integration-node node-one">
                        <span>MR</span>
                        <strong>MR.BUR</strong>
                    </div>

                    <div className="integration-node node-two">
                        <span>EN</span>
                        <strong>Endora</strong>
                    </div>

                    <div className="integration-node node-three">
                        <span>KA</span>
                        <strong>Kaneiko</strong>
                    </div>

                    <div className="integration-node node-four">
                        <span>LU</span>
                        <strong>Lunaflow</strong>
                    </div>

                    <div className="integration-connection connection-one" />
                    <div className="integration-connection connection-two" />
                    <div className="integration-connection connection-three" />
                    <div className="integration-connection connection-four" />
                </div>
            </section>

            <section className="inventory-expiry-section">
                <div className="expiry-copy">
                    <div className="inventory-section-label">Expiry awareness</div>
                    <h2>Spot expiry risks before they become waste.</h2>
                    <p>
                        Track batch and expiry information for inventory items so your team
                        can identify products nearing expiry earlier and make better stock
                        decisions.
                    </p>

                    <div className="expiry-benefits">
                        <span>
                            <CheckCircle2 size={17} />
                            Identify near-expiry items
                        </span>
                        <span>
                            <CheckCircle2 size={17} />
                            Improve batch awareness
                        </span>
                        <span>
                            <CheckCircle2 size={17} />
                            Reduce avoidable waste
                        </span>
                    </div>
                </div>

                <div className="expiry-panel">
                    <div className="expiry-panel-header">
                        <div>
                            <small>Expiry monitoring</small>
                            <h3>Items needing attention</h3>
                        </div>
                        <CalendarClock size={22} />
                    </div>

                    <div className="expiry-item">
                        <div className="expiry-item-image teal-image">
                            <Boxes size={19} />
                        </div>
                        <div className="expiry-item-main">
                            <strong>Composite Resin</strong>
                            <span>Batch B-2048</span>
                        </div>
                        <div className="expiry-date warning-date">
                            <small>Expires in</small>
                            <strong>18 days</strong>
                        </div>
                    </div>

                    <div className="expiry-item">
                        <div className="expiry-item-image amber-image">
                            <PackageCheck size={19} />
                        </div>
                        <div className="expiry-item-main">
                            <strong>Bonding Agent</strong>
                            <span>Batch B-1982</span>
                        </div>
                        <div className="expiry-date danger-date">
                            <small>Expires in</small>
                            <strong>7 days</strong>
                        </div>
                    </div>

                    <div className="expiry-panel-footer">
                        <ShieldCheck size={16} />
                        Batch information stays connected to the item record.
                    </div>
                </div>
            </section>

            <section className="inventory-benefits">
                <div className="inventory-section-heading">
                    <div className="inventory-section-label">Designed for daily use</div>
                    <h2>Make inventory decisions with confidence.</h2>
                </div>

                <div className="benefit-grid">
                    <div>
                        <QrCode size={24} />
                        <h3>Less repetitive work</h3>
                        <p>
                            Capture purchases faster with OCR and connected purchasing flows.
                        </p>
                    </div>

                    <div>
                        <Map size={24} />
                        <h3>Better stock visibility</h3>
                        <p>
                            Understand what is available and where it is stored.
                        </p>
                    </div>

                    <div>
                        <ShieldCheck size={24} />
                        <h3>Stronger stock awareness</h3>
                        <p>
                            Monitor low stock, expiry information, and purchase history.
                        </p>
                    </div>
                </div>
            </section>

            <section id="faq" className="inventory-section inventory-faq">
                <div className="inventory-section-heading">
                    <div className="inventory-section-label">Questions</div>
                    <h2>Good to know.</h2>
                    <p>Some quick answers about the Inventory miniapp.</p>
                </div>

                <div className="faq-list">
                    {faqs.map((faq, index) => (
                        <div className={`faq-item ${openFaq === index ? 'open' : ''}`} key={faq.question}>
                            <button
                                onClick={() => setOpenFaq(openFaq === index ? null : index)}
                                aria-expanded={openFaq === index}
                            >
                                <span>{faq.question}</span>
                                <ChevronDown size={19} />
                            </button>

                            {openFaq === index && (
                                <div className="faq-answer">
                                    <p>{faq.answer}</p>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </section>

            <section className="inventory-final-cta">
                <div>
                    <div className="inventory-section-label">Ready when you are</div>
                    <h2>Bring clarity to your clinic inventory.</h2>
                    <p>
                        Organise your stock, track expiry information, and make your daily
                        inventory workflow easier.
                    </p>
                </div>

                <button className="inventory-primary-button light-button" onClick={handleGetStarted}>
                    Get Started
                    <ArrowRight size={18} />
                </button>
            </section>

            <footer className="inventory-footer">
                <div className="inventory-brand">
                    <img src="/icons/Snabbb-Teal.png" alt="Snabbb" />
                    <span>Inventory</span>
                </div>

                <p>Clearer inventory management for modern clinics.</p>

                <div className="footer-links">
                    <a href="#features">Features</a>
                    <a href="#workflow">How It Works</a>
                    <a href="#faq">FAQ</a>
                </div>
            </footer>
        </main>
    );
};

export default InventoryLandingPage;