import { motion } from 'framer-motion';
import type { DashboardSnapshot } from '../data/types';
import { SectionHeading } from './SectionHeading';
import { DeepDiveCard } from './DeepDiveCard';

interface Props {
  snapshot: DashboardSnapshot;
}

export function DeepDives({ snapshot }: Props) {
  return (
    <div>
      <SectionHeading
        eyebrow="Per-category detail"
        title="What's behind each number"
        subtitle="The scoreboard tells you whether each gate passes. This section tells you what's behind the number — the methodology, the trend, the artifacts."
      />
      <div className="space-y-4">
        {snapshot.categoryDetails.map((detail, i) => {
          const result = snapshot.shipshape.results.find((r) => r.category === detail.category);
          if (!result) return null;
          return (
            <motion.div
              key={detail.category}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.5, delay: i * 0.04, ease: [0.16, 1, 0.3, 1] }}
            >
              <DeepDiveCard detail={detail} result={result} />
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
