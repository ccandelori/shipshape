import { motion } from 'framer-motion';

interface Props {
  eyebrow: string;
  title: string;
  subtitle?: string;
}

export function SectionHeading({ eyebrow, title, subtitle }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="mb-6"
    >
      <div className="label-mono mb-1.5 text-coral-500">{eyebrow}</div>
      <h2 className="text-2xl md:text-3xl font-bold text-ink-700 tracking-tight">{title}</h2>
      {subtitle && <p className="text-ink-400 max-w-3xl leading-relaxed mt-1">{subtitle}</p>}
    </motion.div>
  );
}
