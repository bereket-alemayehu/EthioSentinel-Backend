import { prisma } from "../lib/prisma";

async function seedDiseases() {
  const diseases = [
    { name: "Malaria", code: "MAL-01", slug: "malaria", description: "Fever, chills, and flu-like illness caused by a parasite." },
    { name: "Cholera", code: "CHO-02", slug: "cholera", description: "Acute diarrheal infection caused by ingestion of contaminated food or water." },
    { name: "Measles", code: "MEA-03", slug: "measles", description: "Highly contagious viral disease characterized by fever and red rash." },
    { name: "Yellow Fever", code: "YFE-04", slug: "yellow-fever", description: "Viral hemorrhagic disease transmitted by infected mosquitoes." },
    { name: "Meningitis", code: "MEN-05", slug: "meningitis", description: "Inflammation of the protective membranes covering the brain and spinal cord." },
    { name: "Tuberculosis", code: "TUB-06", slug: "tuberculosis", description: "Infectious disease that mainly affects the lungs." },
    { name: "Typhoid Fever", code: "TYP-07", slug: "typhoid-fever", description: "Bacterial infection that can spread throughout the body and affect many organs." },
    { name: "COVID-19", code: "COV-19", slug: "covid-19", description: "Infectious disease caused by the SARS-CoV-2 virus." },
    { name: "Acute Watery Diarrhea (AWD)", code: "AWD-09", slug: "awd", description: "Sudden onset of diarrhea that can lead to severe dehydration." },
  ];

  console.log("Seeding diseases...");

  for (const disease of diseases) {
    await prisma.disease.upsert({
      where: { code: disease.code },
      update: {
        name: disease.name,
        slug: disease.slug,
        description: disease.description,
      },
      create: disease,
    });
  }

  console.log("Disease seeding complete.");
}

seedDiseases()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
