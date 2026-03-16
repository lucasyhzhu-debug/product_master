import { type ReactNode } from "react";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";

export interface FaqItem {
  question: string;
  answer: string | ReactNode;
}

export interface FaqGroup {
  title: string;
  items: FaqItem[];
}

interface FaqAccordionProps {
  groups: FaqGroup[];
}

export function FaqAccordion({ groups }: FaqAccordionProps) {
  return (
    <div className="space-y-8">
      {groups.map((group, groupIndex) => (
        <div key={groupIndex}>
          <h3 className="text-lg font-semibold mb-3">{group.title}</h3>
          <Accordion type="multiple" className="w-full">
            {group.items.map((item, itemIndex) => (
              <AccordionItem
                key={itemIndex}
                value={`${groupIndex}-${itemIndex}`}
              >
                <AccordionTrigger>{item.question}</AccordionTrigger>
                <AccordionContent>
                  {typeof item.answer === "string" ? (
                    <p className="text-muted-foreground">{item.answer}</p>
                  ) : (
                    item.answer
                  )}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      ))}
    </div>
  );
}
